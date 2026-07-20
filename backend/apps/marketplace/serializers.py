from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers
from rest_framework_gis.fields import GeometryField

from apps.accounts.models import Role

from common.events import publish

from .events import BidPlaced, RequestCreated
from .models import Bid, LocationType, Request, ResultEntry, ResultFile


class ContractorBriefSerializer(serializers.Serializer):
    """Краткая карточка исполнителя — заказчик видит статус верификации и
    агрегат рейтинга в каждом отклике. rating заполнен только там, где
    context содержит "ratings" (см. BidListCreateView.list()) — в остальных
    местах, где этот сериализатор используется без ratings в context
    (MyBidListView/MyAwardedListView, BidCreateSerializer), rating
    структурно будет null, это ожидаемо: этап не делает задела на эти
    эндпоинты (см. docs/progress.md, блок «Репутация» этап 3)."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    verification_status = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()

    def get_verification_status(self, user):
        profile = getattr(user, "contractor_profile", None)
        return profile.verification_status if profile else None

    def get_rating(self, user):
        # X | null, не X | undefined — поле присутствует в ответе всегда,
        # значение None, если у исполнителя нет ни одного отзыва.
        rating = self.context.get("ratings", {}).get(user.id)
        if rating is None:
            return None
        return {"avg": rating.avg, "count": rating.count}


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
    вычисляет статус из пары considered_at/Bid.status, не из Request.status).
    city_id/district_id — структурные id для фильтра по локации на фронте
    (/requests/my-bids, /requests/my-work), без правки backend хватало бы
    только текстового поиска по location_display. Безопасно ровно потому,
    что этот сериализатор рендерится только внутри BidOwnerSerializer.request
    (MyBidListView) и его наследника MyAwardedBidSerializer (MyAwardedListView) —
    оба permission_classes=[IsContractor] + filter(contractor=request.user, ...),
    то есть исполнитель видит id города/района только СВОЕГО собственного
    отклика, того же самого, что уже раскрыт строкой в location_display.
    BidCustomerSerializer (то, что видит заказчик) поле request исключает из
    Meta.fields целиком — этот сериализатор туда не попадает ни при каких
    условиях."""
    id = serializers.IntegerField()
    work_type = serializers.CharField()
    location_display = serializers.SerializerMethodField()
    description = serializers.CharField()
    city_id = serializers.IntegerField(allow_null=True)
    district_id = serializers.IntegerField(allow_null=True)

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


class BidRequestWithStatusSerializer(BidRequestBriefSerializer):
    """BidRequestBriefSerializer + Request.status — ТОЛЬКО для MyAwardedBidSerializer
    («В работе и выполненные»). Безопасно ровно потому, что этот сериализатор
    используется исключительно в MyAwardedListView, которая фильтрует
    Bid.objects.filter(contractor=request.user, status=BidStatus.SELECTED) —
    Bid.status=SELECTED структурно гарантирует, что Request.assigned_contractor
    это тот же самый пользователь (AwardView проставляет оба поля синхронно,
    см. views.py). Третьей стороне статус этой заявки через этот эндпоинт
    увидеть невозможно ни при каких условиях (permission + фильтр по себе)."""
    status = serializers.CharField()


class MyAwardedBidSerializer(BidOwnerSerializer):
    """GET /my-awarded/ — «В работе и выполненные» (architecture.md §4.3):
    только отклики со status=selected (заявка перешла в awarded и далее),
    независимо от статуса откликов на другие заявки. request здесь включает
    Request.status — см. обоснование в BidRequestWithStatusSerializer."""
    request = BidRequestWithStatusSerializer(read_only=True)

    class Meta(BidOwnerSerializer.Meta):
        fields = BidOwnerSerializer.Meta.fields
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


class ResultEntrySerializer(serializers.ModelSerializer):
    """Одна запись ленты результата. author НЕ отдаётся — роль однозначно читается из kind
    (submitted → исполнитель, returned/accepted → заказчик), фронт уже знает обе стороны из
    контекста страницы. Порядок — по Request.result_entries (Meta.ordering = created_at на
    модели), сериализатор его не переопределяет."""
    files = ResultFileSerializer(many=True, read_only=True)

    class Meta:
        model = ResultEntry
        fields = ["id", "kind", "text", "created_at", "files"]


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
    # Лента результата (подшаг 2, 2026-07-17) — заменяет result_note/return_note ниже.
    # Те пока остаются в ответе (удалить в подшаге 3, отдельной миграцией) — но их значения
    # с этого момента ЗАМОРОЖЕНЫ: SubmitResultView/ReturnView больше их не пишут, новые
    # сдачи/возвраты видны только в result_entries.
    result_entries = ResultEntrySerializer(many=True, read_only=True)
    location_display = serializers.SerializerMethodField()

    class Meta:
        model = Request
        fields = [
            "id", "site", "work_type", "description", "tz_file",
            "geometry", "site_geometry", "location_type", "city", "district", "location_display",
            "contractor_note",
            "status", "assigned_contractor",
            "result_files", "result_note", "return_note", "result_entries", "bids_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "assigned_contractor",
            "result_files", "result_note", "return_note", "result_entries", "bids_count",
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


class MyBidBriefSerializer(serializers.ModelSerializer):
    """Отклик ТЕКУЩЕГО исполнителя на ЭТУ заявку — вложенный объект на
    странице заявки (см. RequestFeedDetailSerializer.to_representation).
    Не про чужие отклики — это его собственное действие и его результат,
    инвариант №9 не касается. status/considered_at здесь достаточно, чтобы
    построить все пять состояний «честной панели» на фронте БЕЗ единого
    обращения к Request.status (см. architecture.md §4.3)."""
    class Meta:
        model = Bid
        fields = ["id", "price", "deadline_days", "comment", "created_at", "status", "considered_at"]
        read_only_fields = fields


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
    что ему разрешено видеть (open-заявки + назначенные ему).

    my_bid — СОБСТВЕННЫЙ отклик текущего исполнителя на эту заявку (если
    есть), добавляется через to_representation, не Meta.fields: нужен
    инстанс пользователя из контекста запроса, декларативным полем это не
    выразить. Один дополнительный запрос допустим — это RetrieveAPIView
    (одна заявка за раз), не список: N+1 здесь не возникает (в отличие от
    ленты/RequestFeedSerializer, где my_bid сознательно не добавлен —
    20 строк на странице означали бы 20 лишних запросов).

    status/result_files/result_note/return_note/result_entries раскрываются
    ТОЛЬКО победителю — условие строго instance.assigned_contractor_id ==
    viewer.id, НЕ «есть my_bid». Обе ветки живут в одном to_representation,
    но с разными условиями: my_bid есть у любого откликнувшегося (включая
    проигравших), а эти пять полей — только у того, кого выбрали. Перепутать условия значит повторить
    утечку статуса заявки проигравшему (инвариант №9) — то же самое, что уже
    проверялось живым devtools-тестом на заявке 32 (проигравший видит my_bid,
    но не status/assigned_contractor/result_files/result_note)."""
    site_geometry = GeometryField(source="site.geometry", read_only=True)

    class Meta(RequestFeedSerializer.Meta):
        fields = RequestFeedSerializer.Meta.fields + ["site_geometry"]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # getattr, не user.role напрямую — тот же приём, что и в
        # RequestListCreateView.get_serializer_class(): drf-spectacular
        # интроспектирует схему с AnonymousUser (нет атрибута role), а
        # Bid.objects.filter(contractor=AnonymousUser) упал бы на этапе
        # построения схемы, не только в рантайме.
        viewer = self.context["request"].user
        if getattr(viewer, "role", None) == Role.CONTRACTOR:
            my_bid = Bid.objects.filter(request=instance, contractor=viewer).first()
            if my_bid:
                data["my_bid"] = MyBidBriefSerializer(my_bid).data
            if instance.assigned_contractor_id == viewer.id:
                data["status"] = instance.status
                data["result_files"] = ResultFileSerializer(instance.result_files.all(), many=True).data
                data["result_note"] = instance.result_note
                data["return_note"] = instance.return_note
                data["result_entries"] = ResultEntrySerializer(instance.result_entries.all(), many=True).data
        return data


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
