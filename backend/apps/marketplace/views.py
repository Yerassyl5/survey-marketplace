from __future__ import annotations

from django.conf import settings
from django.db.models import Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers as rf_serializers
from drf_spectacular.utils import extend_schema, extend_schema_view, inline_serializer
from rest_framework import generics, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, VerificationStatus

from common.events import publish

from .events import BidConsidered, DealCompleted, RequestAccepted, RequestAwarded, ResultReturned, ResultSubmitted
from .models import Bid, BidStatus, Request, RequestStatus, ResultFile
from .serializers import (
    BidCreateSerializer,
    BidCustomerSerializer,
    BidOwnerSerializer,
    MyAwardedBidSerializer,
    RequestFeedDetailSerializer,
    RequestFeedForCustomerDetailSerializer,
    RequestFeedForCustomerSerializer,
    RequestFeedSerializer,
    RequestSerializer,
)


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


REQUEST_SELECT_RELATED = (
    "customer", "assigned_contractor", "site",
    "city", "city__region", "district", "district__region",
)

# Единая точка входа исполнителя (лента, детали, отклик) + режим ?scope=feed
# заказчика: заявка видна и доступна для отклика, пока не присвоена (awarded) —
# architecture.md §4.3, инвариант №9. Раздельная фильтрация status=OPEN по
# разным местам кода недопустима: при первом отклике заявка пропадала бы из
# ленты — сам факт исчезновения был бы каналом утечки.
FEED_VISIBLE_STATUSES = (RequestStatus.OPEN, RequestStatus.UNDER_REVIEW)

# Наём ещё не завершён — рассмотрение отклика (и раскрытие телефона) имеет
# смысл только пока заявка не присвоена. Значения сейчас совпадают с
# FEED_VISIBLE_STATUSES, но смысл разный (там — видимость в ленте, здесь —
# допустимость рассмотрения), поэтому отдельная константа, не переиспользование.
PRE_AWARD_STATUSES = (RequestStatus.OPEN, RequestStatus.UNDER_REVIEW)


class RequestPagination(PageNumberPagination):
    # Только лента заявок (шаг B) — остальные списки (отклики, мои отклики)
    # намеренно не пагинируются, объёмы там на порядки меньше.
    page_size = 20

    def get_paginated_response(self, data):
        # today_count — счётчик «новых сегодня» для шапки ленты, посчитан по
        # тому же (уже отфильтрованному work_type/city_id/district_id) queryset,
        # что и count, просто с доп. условием по дате — семантика фильтров одна.
        today = timezone.localdate()
        today_count = self.page.paginator.object_list.filter(created_at__date=today).count()
        return Response({
            "count": self.page.paginator.count,
            "today_count": today_count,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        })


@extend_schema_view(
    get=extend_schema(summary="Лента заявок (заказчику — свои, исполнителю — открытые)"),
    post=extend_schema(summary="Создание заявки заказчиком"),
)
@extend_schema(tags=["marketplace"])
class RequestListCreateView(generics.ListCreateAPIView):
    """
    GET заказчик, без параметра → свои заявки (RequestSerializer, с bids_count) —
    это «Мои заявки».
    GET заказчик, `?scope=feed` → та же открытая лента, что видит исполнитель,
    но обезличенная для чужих заявок (RequestFeedForCustomerSerializer) —
    заказчик листает общий рынок, не откликается.
    GET исполнитель → лента открытых заявок (RequestFeedSerializer — без
    bids_count, зато с customer; фильтры: work_type, region_id/district_id/city_id).
    POST заказчик → создать заявку.
    """
    pagination_class = RequestPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsCustomer()]
        return [permissions.IsAuthenticated()]

    def _is_customer_feed_scope(self) -> bool:
        return self.request.query_params.get("scope") == "feed"

    def get_serializer_class(self):
        # getattr, не user.role напрямую: drf-spectacular интроспектирует схему
        # с AnonymousUser (нет атрибута role), permission_classes тут не спасают.
        role = getattr(self.request.user, "role", None)
        if self.request.method == "POST":
            return RequestSerializer
        if role == Role.CUSTOMER:
            if self._is_customer_feed_scope():
                return RequestFeedForCustomerSerializer
            return RequestSerializer
        return RequestFeedSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Request.objects.select_related(*REQUEST_SELECT_RELATED).prefetch_related(
            "result_files"
        ).order_by("-created_at")
        if user.role == Role.CUSTOMER and not self._is_customer_feed_scope():
            return qs.filter(customer=user)
        # Открытая лента: исполнитель (как всегда) и заказчик с ?scope=feed
        # (инвариант: как только заявка awarded, она пропадает из ленты —
        # дальнейшие статусы видят только заказчик и выбранный исполнитель).
        qs = qs.filter(status__in=FEED_VISIBLE_STATUSES)
        if user.role == Role.CONTRACTOR:
            qs = qs.annotate(
                has_bid=Exists(Bid.objects.filter(request=OuterRef("pk"), contractor=user))
            )
        work_type = self.request.query_params.get("work_type")
        region_id = self.request.query_params.get("region_id")
        district_id = self.request.query_params.get("district_id")
        city_id = self.request.query_params.get("city_id")
        if work_type:
            qs = qs.filter(work_type=work_type)
        if district_id:
            qs = qs.filter(district_id=district_id)
        if city_id:
            qs = qs.filter(city_id=city_id)
        if region_id:
            qs = qs.filter(Q(city__region_id=region_id) | Q(district__region_id=region_id))
        return qs


@extend_schema(tags=["marketplace"], summary="Детали заявки")
class RequestDetailView(generics.RetrieveAPIView):
    """Детали заявки: заказчик-владелец (RequestSerializer, полная информация),
    заказчик, открывший ЧУЖУЮ открытую заявку из общей ленты
    (RequestFeedForCustomerDetailSerializer — обезличенно), или исполнитель
    (открытые + назначенные ему, RequestFeedDetailSerializer — те же правила
    видимости полей, что и в ленте, плюс site_geometry для карты на странице
    заявки — только здесь, не в списке ленты)."""
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        role = getattr(self.request.user, "role", None)
        if role == Role.CUSTOMER:
            return RequestSerializer
        return RequestFeedDetailSerializer

    def get_serializer(self, instance=None, *args, **kwargs):
        # RequestSerializer (по умолчанию для роли customer выше) рассчитан
        # только на «свои» заявки — если это чужая (заказчик открыл её из
        # общей ленты), подменяем на обезличенный вариант. Нужен инстанс,
        # поэтому здесь, а не в get_serializer_class().
        if (
            instance is not None
            and getattr(self.request.user, "role", None) == Role.CUSTOMER
            and instance.customer_id != self.request.user.id
        ):
            return RequestFeedForCustomerDetailSerializer(instance, context=self.get_serializer_context())
        return super().get_serializer(instance, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        qs = Request.objects.select_related(*REQUEST_SELECT_RELATED).prefetch_related("result_files")
        if user.role == Role.CUSTOMER:
            # Свои — в любом статусе; чужие — только открытые (та же общая
            # лента, что и на /feed?scope=feed).
            return qs.filter(Q(customer=user) | Q(status__in=FEED_VISIBLE_STATUSES))
        # Третье условие — id__in=Bid.objects...values("request_id"), НЕ
        # Q(bids__contractor=user). Разница критична: Q(bids__contractor=...)
        # заставляет Django сделать JOIN на marketplace_bid прямо в основном
        # запросе (не EXISTS-подзапрос, как у аннотации has_bid ниже) — если у
        # заявки несколько откликов от РАЗНЫХ исполнителей (обычный случай),
        # JOIN размножает строку Request по числу откликов, и .get(pk=X) в
        # get_object_or_404 падает MultipleObjectsReturned (500) на ЛЮБОЙ
        # заявке с ≥2 откликами — не только там, где сработало бы новое
        # условие. id__in=(...) — это IN (SELECT ...), подзапрос, а не JOIN:
        # строк не размножает. Регрессия на это condition покрыта
        # test_contractor_detail_no_multiple_objects_returned_with_rival_bids.
        #
        # Условие открывает исполнителю ЛЮБОЙ его отклик независимо от
        # текущего статуса заявки — заявка часть его истории («Мои отклики»,
        # PRODUCT_SPEC 1.4), скрывать её после awarded/rejected нельзя.
        # Проигравший при этом НЕ получает Request.status/result_files —
        # RequestFeedDetailSerializer их структурно не отдаёт никому, кроме
        # my_bid (см. serializers.py), которое про его собственный отклик.
        return qs.filter(
            Q(status__in=FEED_VISIBLE_STATUSES)
            | Q(assigned_contractor=user)
            | Q(id__in=Bid.objects.filter(contractor=user).values("request_id"))
        ).annotate(
            has_bid=Exists(Bid.objects.filter(request=OuterRef("pk"), contractor=user))
        )


@extend_schema_view(
    get=extend_schema(summary="Список откликов на заявку (для заказчика)"),
    post=extend_schema(summary="Отклик исполнителя на заявку"),
)
@extend_schema(tags=["marketplace"])
class BidListCreateView(generics.ListCreateAPIView):
    """
    GET заказчик (владелец) → список откликов, verification_status исполнителя,
    considered_at и contractor_phone (гейт по considered_at) — BidCustomerSerializer.
    POST исполнитель → откликнуться на открытую/рассматриваемую заявку —
    BidCreateSerializer (без considered_at/contractor_phone).
    """
    def get_permissions(self):
        if self.request.method == "POST":
            return [ContractorCanBid()]
        return [IsCustomer()]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return BidCreateSerializer
        return BidCustomerSerializer

    def get_queryset(self):
        # Проверяем, что текущий заказчик владеет заявкой
        get_object_or_404(Request, pk=self.kwargs["request_pk"], customer=self.request.user)
        return Bid.objects.select_related(
            "contractor", "contractor__contractor_profile"
        ).filter(request_id=self.kwargs["request_pk"])

    def perform_create(self, serializer):
        request_obj = get_object_or_404(
            Request, pk=self.kwargs["request_pk"], status__in=FEED_VISIBLE_STATUSES
        )
        if Bid.objects.filter(request=request_obj, contractor=self.request.user).exists():
            from rest_framework.exceptions import ValidationError
            # Явный dict, не голая строка: ValidationError("...") сериализуется DRF
            # в JSON-массив ["..."] без ключа "detail" — фронтенд (client.ts,
            # extractErrorMessage) ждёт объект с .detail и не находит сообщение.
            raise ValidationError({"detail": "Вы уже откликнулись на эту заявку."})
        serializer.save(request=request_obj, contractor=self.request.user)
        # Автопереход open → under_review при первом отклике — ТОЛЬКО через
        # queryset .update() (единое правило для любого изменения статуса,
        # в миграциях и в рантайме без исключений): instance.save() молча
        # трогает updated_at (auto_now=True), а фид отдаёт updated_at в JSON —
        # сравнение created_at/updated_at выдало бы факт первого отклика без
        # единого явного поля статуса (инвариант №9). Условие status=OPEN в
        # filter() — идемпотентно и безопасно при гонке двух первых откликов.
        Request.objects.filter(pk=request_obj.pk, status=RequestStatus.OPEN).update(
            status=RequestStatus.UNDER_REVIEW
        )


# request__city/request__district/request__district__region — иначе
# BidRequestBriefSerializer.get_location_display() (Request.location_label)
# даёт N+1 на каждый отклик: CITY трогает request.city, DISTRICT —
# request.district И request.district.region. Найдено и проверено
# assertNumQueries на MyBidListView (test_my_bids_location_display_does_not_n_plus_one),
# тот же select_related нужен MyAwardedListView по той же причине — общая
# константа, не дублирование списком в двух местах.
BID_REQUEST_SELECT_RELATED = (
    "request", "request__city", "request__district", "request__district__region",
    "contractor", "contractor__contractor_profile",
)


@extend_schema(tags=["marketplace"], summary="Свои отклики исполнителя")
class MyBidListView(generics.ListAPIView):
    """Отклики текущего исполнителя на все заявки. considered_at виден
    (статус «рассматривают» в будущем кабинете), contractor_phone — нет:
    раскрытие телефона одностороннее, только заказчику-владельцу заявки."""
    serializer_class = BidOwnerSerializer
    permission_classes = [IsContractor]

    def get_queryset(self):
        return Bid.objects.select_related(*BID_REQUEST_SELECT_RELATED).filter(
            contractor=self.request.user
        )


@extend_schema(tags=["marketplace"], summary="Заявки, которые исполнитель выиграл (в работе и выполненные)")
class MyAwardedListView(generics.ListAPIView):
    """«В работе и выполненные» (architecture.md §4.3, PRODUCT_SPEC 1.4) —
    раздельный от «Моих откликов» раздел кабинета исполнителя. Фильтр —
    Bid.status=SELECTED, НЕ Request.assigned_contractor напрямую (решение
    спеки): показываем только заявки, где сам отклик выбран, независимо от
    статуса откликов на другие заявки этого исполнителя."""
    serializer_class = MyAwardedBidSerializer
    permission_classes = [IsContractor]

    def get_queryset(self):
        return Bid.objects.select_related(*BID_REQUEST_SELECT_RELATED).filter(
            contractor=self.request.user, status=BidStatus.SELECTED
        )


@extend_schema(tags=["marketplace"], summary="Заказчик рассматривает отклик (раскрытие телефона)")
class ConsiderBidView(APIView):
    """Заказчик отмечает отклик рассмотренным — фиксирует момент и в тот же
    момент раскрывает телефон исполнителя (architecture.md §4.3). Идемпотентно:
    повторный вызов не перезаписывает considered_at и не публикует BidConsidered
    повторно (иначе будущее письмо «вас рассматривают» задублируется)."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        bid = Bid.objects.select_related("request", "contractor").filter(
            pk=pk, request__customer=request.user
        ).first()
        if not bid:
            return Response({"detail": "Отклик не найден или недоступен."}, status=status.HTTP_404_NOT_FOUND)
        if bid.request.status not in PRE_AWARD_STATUSES:
            return Response(
                {"detail": "Заявка уже не принимает рассмотрение откликов — исполнитель уже выбран или сделка завершена."},
                status=status.HTTP_409_CONFLICT,
            )
        # Правило блока 1 без исключений: любой переход состояния — только
        # через queryset .update(). considered_at__isnull=True в filter()
        # одновременно даёт идемпотентность (повторный вызов — 0 строк).
        newly_considered = Bid.objects.filter(pk=bid.pk, considered_at__isnull=True).update(
            considered_at=timezone.now()
        )
        bid.refresh_from_db(fields=["considered_at"])
        if newly_considered:
            publish(BidConsidered(
                request_id=bid.request_id, bid_id=bid.id, contractor_id=bid.contractor_id,
            ))
        return Response(BidCustomerSerializer(bid).data)


@extend_schema(tags=["marketplace"], summary="Выбор исполнителя заказчиком", request={"application/json": {"type": "object", "properties": {"bid_id": {"type": "integer"}}}})
class AwardView(APIView):
    """Заказчик выбирает исполнителя (по bid_id). Остальные отклики — отклоняются."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        req = Request.objects.filter(
            pk=pk, customer=request.user, status=RequestStatus.UNDER_REVIEW
        ).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        bid_id = request.data.get("bid_id")
        bid = Bid.objects.filter(pk=bid_id, request=req).first()
        if not bid:
            return Response({"detail": "Отклик не найден."}, status=status.HTTP_400_BAD_REQUEST)
        if bid.considered_at is None:
            return Response(
                {"detail": "Нельзя выбрать нерассмотренный отклик — сначала рассмотрите его."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        Request.objects.filter(pk=req.pk).update(
            status=RequestStatus.AWARDED, assigned_contractor=bid.contractor
        )
        Bid.objects.filter(request=req, pk=bid_id).update(status=BidStatus.SELECTED)
        Bid.objects.filter(request=req).exclude(pk=bid_id).update(status=BidStatus.REJECTED)
        publish(RequestAwarded(request_id=req.id, contractor_id=bid.contractor_id))
        return Response({"status": RequestStatus.AWARDED})


@extend_schema(
    tags=["marketplace"],
    summary="Сдача результата исполнителем",
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
        Request.objects.filter(pk=req.pk).update(
            status=RequestStatus.RESULT_SUBMITTED,
            result_note=request.data.get("result_note", req.result_note),
        )
        publish(ResultSubmitted(request_id=req.id))
        return Response({"status": RequestStatus.RESULT_SUBMITTED})


@extend_schema(tags=["marketplace"], summary="Приём результата заказчиком")
class AcceptView(APIView):
    """Заказчик принимает результат. Статус «принято» ставит ТОЛЬКО заказчик (инвариант №2)."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        req = Request.objects.filter(
            pk=pk, customer=request.user, status=RequestStatus.RESULT_SUBMITTED
        ).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.ACCEPTED)
        publish(RequestAccepted(request_id=req.id))
        publish(DealCompleted(request_id=req.id))
        return Response({"status": RequestStatus.ACCEPTED})


@extend_schema(tags=["marketplace"], summary="Возврат результата на доработку")
class ReturnView(APIView):
    """Заказчик возвращает результат на доработку — заявка переходит обратно в awarded."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        req = Request.objects.filter(
            pk=pk, customer=request.user, status=RequestStatus.RESULT_SUBMITTED
        ).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        Request.objects.filter(pk=req.pk).update(status=RequestStatus.AWARDED)
        publish(ResultReturned(request_id=req.id))
        return Response({"status": RequestStatus.AWARDED})
