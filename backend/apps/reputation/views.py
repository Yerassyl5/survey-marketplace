from __future__ import annotations

from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.marketplace.models import Request, RequestStatus

from common.events import publish

from .events import ReviewLeft
from .models import Review, ReviewTag
from .serializers import ReviewCreateSerializer, ReviewSerializer, ReviewTagSerializer
from .services import get_ratings_for_contractors


class IsCustomer(permissions.BasePermission):
    """Дублируется по образцу marketplace/sites — в проекте нет общего
    permissions.py, каждый app определяет свою минимальную проверку роли
    (см. те же классы в apps.marketplace.views/apps.sites.views; техдолг
    зафиксирован в docs/progress.md)."""
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.CUSTOMER)


@extend_schema_view(
    get=extend_schema(summary="Прочитать отзыв на заявку (публично, любой залогиненный)"),
    post=extend_schema(summary="Оставить отзыв заказчиком (только после accepted)"),
)
@extend_schema(tags=["reputation"])
class ReviewDetailCreateView(APIView):
    """GET — отзыв публичен по решению продукта (PRODUCT_SPEC 1.10, инвариант
    №9 новой редакции: после accepted факт победы не секрет) — IsAuthenticated,
    БЕЗ проверки владения/роли. 404 — только когда отзыва физически нет (Review
    существует исключительно при Request.status=accepted, других состояний
    для существующего Review быть не может — сюда нечего утекать).

    POST — только заказчик-владелец заявки, только в статусе accepted
    (инварианты №1/№8). Один filter().first() — владение и статус
    неразличимы для наблюдателя (паттерн AcceptView/ReturnView). Дубль — 409:
    заказчик-владелец и так знает, что заявка есть и отзыв уже оставлен
    (паттерн ConsiderBidView/WithdrawBidView), 404 тут сбивал бы фронт с
    толку."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsCustomer()]
        return [permissions.IsAuthenticated()]

    def get(self, request, pk):
        review = Review.objects.select_related("contractor").prefetch_related("tags").filter(
            request_id=pk
        ).first()
        if not review:
            return Response({"detail": "Отзыв не найден."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReviewSerializer(review).data)

    def post(self, request, pk):
        req = Request.objects.filter(
            pk=pk, customer=request.user, status=RequestStatus.ACCEPTED
        ).first()
        if not req:
            return Response({"detail": "Заявка не найдена или недоступна."}, status=status.HTTP_404_NOT_FOUND)
        if Review.objects.filter(request=req).exists():
            return Response({"detail": "Отзыв на эту заявку уже оставлен."}, status=status.HTTP_409_CONFLICT)
        if req.assigned_contractor_id is None:
            # Request.assigned_contractor — SET_NULL: если аккаунт исполнителя
            # удалён после закрытия сделки, поле обнуляется, а Review.contractor
            # не nullable — без этой проверки serializer.save() упал бы 500
            # вместо внятного ответа.
            return Response(
                {"detail": "Исполнитель по этой заявке недоступен."}, status=status.HTTP_409_CONFLICT
            )
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = serializer.save(request=req, contractor=req.assigned_contractor)
        publish(ReviewLeft(
            request_id=req.id, contractor_id=req.assigned_contractor_id, rating=review.rating,
        ))
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["reputation"], summary="Рейтинг и отзывы исполнителя (публично)")
class ContractorReviewsView(APIView):
    """pk — тот же контракт, что accounts.views.ContractorPublicView: 404
    одинаково для несуществующего id и для id заказчика (сторонний наблюдатель
    не должен различать эти два случая). Без пагинации — максимум отзывов на
    одного исполнителя в dev-БД сейчас 4 (проверено запросом при планировании
    этапа), тот же принцип, что у TagListView ниже.

    Правило «это исполнитель» ПРОДУБЛИРОВАНО в apps.accounts.views.
    ContractorPublicView (там — фильтр queryset, здесь — явный .exists()) —
    при изменении условия менять синхронно в обоих местах."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if not User.objects.filter(pk=pk, role=Role.CONTRACTOR).exists():
            return Response({"detail": "Исполнитель не найден."}, status=status.HTTP_404_NOT_FOUND)
        reviews = Review.objects.select_related("contractor").prefetch_related("tags").filter(contractor_id=pk)
        rating = get_ratings_for_contractors([pk]).get(pk)
        return Response({
            "rating": {"avg": rating.avg, "count": rating.count} if rating else None,
            "reviews": ReviewSerializer(reviews, many=True).data,
        })


@extend_schema(tags=["reputation"], summary="Справочник тегов отзыва")
class TagListView(generics.ListAPIView):
    """Справочник тегов отзыва (ReviewTag, только положительные — architecture.md
    §4.5), редактируется через Django Admin, без изменения кода. Без пагинации:
    записей единицы (сейчас 6 засеянных), тот же принцип, что GET
    /api/geo/locations/ (маленький почти статичный справочник). Порядок —
    Meta.ordering=["name"] на модели, сериализатор его не переопределяет."""
    queryset = ReviewTag.objects.all()
    serializer_class = ReviewTagSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
