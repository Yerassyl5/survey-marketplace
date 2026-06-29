from __future__ import annotations

from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers as rf_serializers
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, VerificationStatus

from common.events import publish

from .events import DealCompleted, RequestAccepted, RequestAwarded, ResultReturned, ResultSubmitted
from .models import Bid, BidStatus, Request, RequestStatus, ResultFile
from .serializers import BidSerializer, RequestSerializer


class IsCustomer(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.CUSTOMER)


class IsContractor(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.CONTRACTOR)


class ContractorCanBid(permissions.BasePermission):
    """
    Сейчас пропускает всех исполнителей (мягкий вариант, MVP).
    Чтобы включить жёсткую блокировку для неверифицированных — выставить
    REQUIRE_VERIFIED_TO_BID=True в settings/env (architecture.md инвариант №5).
    """
    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated and request.user.role == Role.CONTRACTOR):
            return False
        if getattr(settings, "REQUIRE_VERIFIED_TO_BID", False):
            profile = getattr(request.user, "contractor_profile", None)
            return bool(profile and profile.verification_status == VerificationStatus.VERIFIED)
        return True


@extend_schema(tags=["marketplace"])
class RequestListCreateView(generics.ListCreateAPIView):
    """
    GET заказчик  → свои заявки.
    GET исполнитель → лента открытых заявок (фильтры: work_type, city).
    POST заказчик → создать заявку.
    """
    serializer_class = RequestSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsCustomer()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = Request.objects.select_related("customer", "assigned_contractor", "site").prefetch_related("result_files")
        if user.role == Role.CUSTOMER:
            return qs.filter(customer=user)
        # Исполнитель видит ленту открытых заявок с фильтрацией по нише и городу
        qs = qs.filter(status=RequestStatus.OPEN)
        work_type = self.request.query_params.get("work_type")
        city = self.request.query_params.get("city")
        if work_type:
            qs = qs.filter(work_type=work_type)
        if city:
            qs = qs.filter(city__icontains=city)
        return qs


@extend_schema(tags=["marketplace"])
class RequestDetailView(generics.RetrieveAPIView):
    """Детали заявки: заказчик (владелец) или исполнитель (открытые + назначенные)."""
    serializer_class = RequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Request.objects.select_related("customer", "assigned_contractor", "site").prefetch_related("result_files")
        if user.role == Role.CUSTOMER:
            return qs.filter(customer=user)
        return qs.filter(Q(status=RequestStatus.OPEN) | Q(assigned_contractor=user))


@extend_schema(tags=["marketplace"])
class BidListCreateView(generics.ListCreateAPIView):
    """
    GET заказчик (владелец) → список откликов с verification_status исполнителя.
    POST исполнитель → откликнуться на открытую заявку.
    """
    serializer_class = BidSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [ContractorCanBid()]
        return [IsCustomer()]

    def get_queryset(self):
        # Проверяем, что текущий заказчик владеет заявкой
        get_object_or_404(Request, pk=self.kwargs["request_pk"], customer=self.request.user)
        return Bid.objects.select_related(
            "contractor", "contractor__contractor_profile"
        ).filter(request_id=self.kwargs["request_pk"])

    def perform_create(self, serializer):
        request_obj = get_object_or_404(
            Request, pk=self.kwargs["request_pk"], status=RequestStatus.OPEN
        )
        if Bid.objects.filter(request=request_obj, contractor=self.request.user).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Вы уже откликнулись на эту заявку.")
        serializer.save(request=request_obj, contractor=self.request.user)


@extend_schema(tags=["marketplace"])
class MyBidListView(generics.ListAPIView):
    """Отклики текущего исполнителя на все заявки."""
    serializer_class = BidSerializer
    permission_classes = [IsContractor]

    def get_queryset(self):
        return Bid.objects.select_related(
            "request", "contractor", "contractor__contractor_profile"
        ).filter(contractor=self.request.user)


@extend_schema(tags=["marketplace"], request={"application/json": {"type": "object", "properties": {"bid_id": {"type": "integer"}}}})
class AwardView(APIView):
    """Заказчик выбирает исполнителя (по bid_id). Остальные отклики — отклоняются."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        req = Request.objects.filter(pk=pk, customer=request.user, status=RequestStatus.OPEN).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        bid_id = request.data.get("bid_id")
        bid = Bid.objects.filter(pk=bid_id, request=req).first()
        if not bid:
            return Response({"detail": "Отклик не найден."}, status=status.HTTP_400_BAD_REQUEST)
        req.status = RequestStatus.AWARDED
        req.assigned_contractor = bid.contractor
        req.save(update_fields=["status", "assigned_contractor", "updated_at"])
        Bid.objects.filter(request=req, pk=bid_id).update(status=BidStatus.SELECTED)
        Bid.objects.filter(request=req).exclude(pk=bid_id).update(status=BidStatus.REJECTED)
        publish(RequestAwarded(request_id=req.id, contractor_id=bid.contractor_id))
        return Response({"status": req.status})


@extend_schema(
    tags=["marketplace"],
    request=inline_serializer(
        name="SubmitResultRequest",
        fields={
            "result_files": rf_serializers.ListField(
                child=rf_serializers.FileField(),
                help_text="Один или несколько файлов результата (при первой сдаче обязательно)",
            ),
            "result_note": rf_serializers.CharField(
                required=False,
                allow_blank=True,
                help_text="Текстовый комментарий к результату",
            ),
        },
    ),
)
class SubmitResultView(APIView):
    """Исполнитель сдаёт результат (файл + комментарий). Переводит заявку в result_submitted."""
    permission_classes = [IsContractor]

    def post(self, request, pk):
        req = Request.objects.filter(
            pk=pk, assigned_contractor=request.user, status=RequestStatus.AWARDED
        ).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        files = request.FILES.getlist("result_files")
        has_existing = req.result_files.exists()
        if not has_existing and not files:
            return Response(
                {"detail": "При первой сдаче необходимо прикрепить хотя бы один файл."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for f in files:
            ResultFile.objects.create(request=req, file=f, original_name=f.name)
        req.result_note = request.data.get("result_note", req.result_note)
        req.status = RequestStatus.RESULT_SUBMITTED
        req.save(update_fields=["status", "result_note", "updated_at"])
        publish(ResultSubmitted(request_id=req.id))
        return Response({"status": req.status})


@extend_schema(tags=["marketplace"])
class AcceptView(APIView):
    """Заказчик принимает результат. Статус «принято» ставит ТОЛЬКО заказчик (инвариант №2)."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        req = Request.objects.filter(
            pk=pk, customer=request.user, status=RequestStatus.RESULT_SUBMITTED
        ).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        req.status = RequestStatus.ACCEPTED
        req.save(update_fields=["status", "updated_at"])
        publish(RequestAccepted(request_id=req.id))
        publish(DealCompleted(request_id=req.id))
        return Response({"status": req.status})


@extend_schema(tags=["marketplace"])
class ReturnView(APIView):
    """Заказчик возвращает результат на доработку — заявка переходит обратно в awarded."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        req = Request.objects.filter(
            pk=pk, customer=request.user, status=RequestStatus.RESULT_SUBMITTED
        ).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        req.status = RequestStatus.AWARDED
        req.save(update_fields=["status", "updated_at"])
        publish(ResultReturned(request_id=req.id))
        return Response({"status": req.status})
