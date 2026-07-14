from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers
from rest_framework_gis.fields import GeometryField

from common.events import publish

from .events import BidPlaced, RequestCreated
from .models import Bid, LocationType, Request, ResultFile


class ContractorBriefSerializer(serializers.Serializer):
    """Краткая карточка исполнителя — заказчик видит статус верификации в каждом отклике."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    verification_status = serializers.SerializerMethodField()

    def get_verification_status(self, user):
        profile = getattr(user, "contractor_profile", None)
        return profile.verification_status if profile else None


class CustomerBriefSerializer(serializers.Serializer):
    """Заказчик — открытая информация в ленте (кто разместил заявку), не секрет."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    organization_name = serializers.CharField(allow_blank=True)


class BidCreateSerializer(serializers.ModelSerializer):
    """POST — создание отклика исполнителем. considered_at/contractor_phone
    сюда не добавляются: при создании considered_at всегда null, а телефон
    (одностороннее раскрытие заказчику) исполнителю в принципе не отдаётся."""
    contractor = ContractorBriefSerializer(read_only=True)
    # Цена и срок — предложение исполнителя, обязательны при отклике (переопределяем
    # blank=True/null=True модели, которые нужны только для прямого создания в БД).
    price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    deadline_days = serializers.IntegerField(min_value=1)

    class Meta:
        model = Bid
        fields = ["id", "contractor", "comment", "price", "deadline_days", "status", "created_at"]
        read_only_fields = ["id", "contractor", "status", "created_at"]

    def create(self, validated_data):
        bid = super().create(validated_data)
        publish(BidPlaced(
            request_id=bid.request_id,
            bid_id=bid.id,
            contractor_id=bid.contractor_id,
        ))
        return bid


class BidRequestBriefSerializer(serializers.Serializer):
    """Заявка, на которую сделан отклик — контекст для «Моих откликов»
    (BidOwnerSerializer). Инвариант №9: НЕ включает status/considered_at/
    bids_count — исполнитель уже видит статус СВОЕГО отклика на верхнем
    уровне (considered_at + Bid.status), Request.status ему в этом разделе
    не нужен и не добавляется (см. architecture.md §4.3 — «Мои отклики»
    вычисляет статус из пары considered_at/Bid.status, не из Request.status)."""
    id = serializers.IntegerField()
    work_type = serializers.CharField()
    location_display = serializers.SerializerMethodField()
    description = serializers.CharField()

    def get_location_display(self, obj):
        return obj.location_label


class BidOwnerSerializer(serializers.ModelSerializer):
    """GET — исполнитель смотрит СВОИ отклики (MyBidListView, по всем заявкам).
    considered_at виден (нужен для статуса «ожидает/рассматривают/выбран/не
    выбран» в будущем кабинете исполнителя, PRODUCT_SPEC 1.4) — contractor_phone
    здесь НЕТ вообще, поле не существует в этой структуре ответа: раскрытие
    телефона одностороннее (только заказчику), это не гейт по значению, а
    отсутствие поля как такового для этой аудитории. request — краткая карточка
    заявки (см. BidRequestBriefSerializer), без неё «Мои отклики» нечего
    рендерить (цена/срок без указания, НА ЧТО откликался)."""
    contractor = ContractorBriefSerializer(read_only=True)
    request = BidRequestBriefSerializer(read_only=True)

    class Meta:
        model = Bid
        fields = [
            "id", "contractor", "request", "comment", "price", "deadline_days",
            "status", "considered_at", "created_at",
        ]
        read_only_fields = fields


class BidCustomerSerializer(BidOwnerSerializer):
    """GET — заказчик-владелец смотрит отклики на свою заявку. Плюс
    contractor_phone — гейт на уровне сериализатора (SerializerMethodField),
    не в UI/вьюхе: раскрывается только после Bid.considered_at (см.
    ConsiderBidView), иначе None. request ИСКЛЮЧЕНО из унаследованных полей:
    заказчик и так на странице своей заявки (контекст уже есть), а
    BidListCreateView.get_queryset() не делает select_related("request") —
    оставить поле означало бы N+1 на каждый отклик (плюс ещё запросы на
    city/district внутри location_label) ради дублирующей информации."""
    contractor_phone = serializers.SerializerMethodField()

    class Meta(BidOwnerSerializer.Meta):
        fields = [f for f in BidOwnerSerializer.Meta.fields if f != "request"] + ["contractor_phone"]
        read_only_fields = fields

    def get_contractor_phone(self, obj):
        return obj.contractor.phone if obj.considered_at else None


class ResultFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResultFile
        fields = ["id", "file", "original_name", "uploaded_at"]


class RequestLocationValidationMixin:
    """Условная обязательность локации: city при location_type=city,
    district при location_type=district (тот же приём, что ИИН/БИН в accounts)."""

    def validate(self, attrs):
        location_type = attrs.get("location_type", getattr(self.instance, "location_type", None))
        city = attrs.get("city", getattr(self.instance, "city", None))
        district = attrs.get("district", getattr(self.instance, "district", None))
        if location_type == LocationType.CITY:
            if not city:
                raise serializers.ValidationError({"city": "Обязателен при локации «Город»."})
            if district:
                raise serializers.ValidationError({"district": "Не заполняется при локации «Город»."})
        elif location_type == LocationType.DISTRICT:
            if not district:
                raise serializers.ValidationError({"district": "Обязателен при локации «Район»."})
            if city:
                raise serializers.ValidationError({"city": "Не заполняется при локации «Район»."})
        return attrs


class RequestSerializer(RequestLocationValidationMixin, serializers.ModelSerializer):
    """Для ЗАКАЗЧИКА — его собственные заявки. Показывает bids_count (число откликов),
    НЕ показывает customer (это он сам)."""
    geometry = GeometryField(required=False, allow_null=True)
    # Геометрия ОБЪЕКТА (Site), не заявки — та же голая GeometryField под тем же
    # именем, что и в RequestFeedDetailSerializer/RequestFeedForCustomerDetailSerializer,
    # чтобы фронтовый `request.geometry ?? request.site_geometry` (SiteMap на
    # /requests/[id]) работал одинаково для всех ролей. До этой правки поле
    # отсутствовало здесь — заказчик не видел карту на СВОЕЙ заявке (единственный
    # путь, где используется этот сериализатор), хотя у объекта геометрия была.
    site_geometry = GeometryField(source="site.geometry", read_only=True)
    bids_count = serializers.IntegerField(source="bids.count", read_only=True)
    result_files = ResultFileSerializer(many=True, read_only=True)
    location_display = serializers.SerializerMethodField()

    class Meta:
        model = Request
        fields = [
            "id", "site", "work_type", "description", "tz_file",
            "geometry", "site_geometry", "location_type", "city", "district", "location_display",
            "contractor_note",
            "status", "assigned_contractor",
            "result_files", "result_note", "bids_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "assigned_contractor",
            "result_files", "result_note", "bids_count",
            "created_at", "updated_at", "location_display",
        ]

    def get_location_display(self, obj: Request) -> str:
        return obj.location_label

    def validate_site(self, site):
        # Заказчик мог подставить чужой site_id (объект не привязан к текущему
        # владельцу) — раньше это было некому эксплуатировать (формы создания
        # не было, только API/админка), но раз появляется форма — закрываем дыру.
        request = self.context["request"]
        if site.owner_id != request.user.id:
            raise serializers.ValidationError("Объект не найден.")
        return site

    def create(self, validated_data):
        validated_data["customer"] = self.context["request"].user
        request_obj = super().create(validated_data)
        publish(RequestCreated(
            request_id=request_obj.id,
            niche=request_obj.work_type,
            city=request_obj.location_label,
            site_id=request_obj.site_id,
        ))
        return request_obj


class RequestFeedSerializer(serializers.ModelSerializer):
    """Для ИСПОЛНИТЕЛЯ — лента открытых заявок. Показывает customer (открытая
    информация — кто заказчик), НЕ показывает bids_count: если исполнители видят
    «0 откликов», они понимают отсутствие конкуренции и завышают цену — скрытие
    защищает от манипуляции ценами. Только чтение, всегда через GET open-фида."""
    customer = CustomerBriefSerializer(read_only=True)
    geometry = GeometryField(required=False, allow_null=True)
    location_display = serializers.SerializerMethodField()
    # Аннотация Exists() из get_queryset() вьюхи (один SQL-запрос на всю
    # страницу, не N+1) — SerializerMethodField с getattr-фолбэком, чтобы не
    # падать, если сериализатор когда-нибудь используется на неаннотированном qs.
    has_bid = serializers.SerializerMethodField()

    class Meta:
        model = Request
        fields = [
            "id", "site", "work_type", "description", "tz_file",
            "geometry", "location_type", "city", "district", "location_display",
            "contractor_note",
            # updated_at НЕ отдаётся исполнителю (и заказчику в ?scope=feed) —
            # инвариант №9: auto_now на Request позволил бы сравнить created_at/
            # updated_at и вычислить факт первого отклика без единого явного
            # поля статуса. Подтверждено: RequestFeedSerializer — плоский
            # ModelSerializer (не GeoFeatureModelSerializer, тот только у
            # sites.SiteSerializer), Meta.fields — единственный источник полей,
            # ничего не подставляется обратно.
            "customer", "has_bid", "created_at",
        ]
        read_only_fields = fields

    def get_location_display(self, obj: Request) -> str:
        return obj.location_label

    def get_has_bid(self, obj: Request) -> bool:
        return bool(getattr(obj, "has_bid", False))


class RequestFeedDetailSerializer(RequestFeedSerializer):
    """Только для RequestDetailView (карточка заявки, исполнитель) — не для
    ленты: список не должен таскать геометрию объекта на 20 строк, она там
    не используется. site_geometry — ГОЛАЯ GeoJSON-геометрия (bare
    GeometryField, как и унаследованный geometry), НЕ Feature: в отличие от
    sites.SiteSerializer (GeoFeatureModelSerializer), тут нет обёртки
    {"type": "Feature", "geometry": {...}, "properties": {...}} — сразу
    {"type": "Point", "coordinates": [...]}. Карточка объекта (sites) не
    трогается и остаётся приватной для заказчика-владельца (IsCustomer) —
    геометрию исполнителю отдаёт marketplace, который уже правильно решает,
    что ему разрешено видеть (open-заявки + назначенные ему)."""
    site_geometry = GeometryField(source="site.geometry", read_only=True)

    class Meta(RequestFeedSerializer.Meta):
        fields = RequestFeedSerializer.Meta.fields + ["site_geometry"]
        read_only_fields = fields


class RequestFeedForCustomerSerializer(RequestFeedSerializer):
    """Для ЗАКАЗЧИКА, просматривающего общую ленту (`?scope=feed`) — та же
    открытая лента, что видит исполнитель, НО: (1) `has_bid` не отдаётся —
    заказчик не откликается, поле ему не релевантно; (2) `customer` чужих
    заявок обезличивается («Заказчик» без имени/организации) — заказчики не
    должны видеть активность друг друга по именам, только своё видно полностью.
    Обезличивание — по инстансу (свой/чужой), поэтому через to_representation,
    не через поле класса (CustomerBriefSerializer не знает, кто сейчас смотрит)."""

    class Meta(RequestFeedSerializer.Meta):
        fields = [f for f in RequestFeedSerializer.Meta.fields if f != "has_bid"]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = self.context["request"].user
        if instance.customer_id != viewer.id:
            data["customer"] = {"id": None, "full_name": "Заказчик", "organization_name": ""}
        return data


class RequestFeedForCustomerDetailSerializer(RequestFeedForCustomerSerializer):
    """То же обезличивание + site_geometry — заказчик, открывший ЧУЖУЮ открытую
    заявку из общей ленты (RequestDetailView), тоже видит карту объекта."""
    site_geometry = GeometryField(source="site.geometry", read_only=True)

    class Meta(RequestFeedForCustomerSerializer.Meta):
        fields = RequestFeedForCustomerSerializer.Meta.fields + ["site_geometry"]
        read_only_fields = fields
