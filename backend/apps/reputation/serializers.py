from __future__ import annotations

from rest_framework import serializers

from .models import Review, ReviewTag


class ReviewTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReviewTag
        fields = ["id", "name"]


class ReviewContractorBriefSerializer(serializers.Serializer):
    """Тот же принцип, что ContractorBriefSerializer в marketplace, но не
    импортируем оттуда — reputation не должен тянуть чужой сериализатор,
    только модель User через уже существующий FK Review.contractor."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()


class ReviewSerializer(serializers.ModelSerializer):
    """GET — публичное чтение (см. ReviewDetailCreateView: IsAuthenticated,
    без проверки владения/роли). Отзыв — публичная запись доверия по решению
    продукта (PRODUCT_SPEC 1.10, инвариант №9 новой редакции)."""
    contractor = ReviewContractorBriefSerializer(read_only=True)
    tags = ReviewTagSerializer(many=True, read_only=True)

    class Meta:
        model = Review
        fields = ["id", "request", "contractor", "rating", "comment", "tags", "created_at"]
        read_only_fields = fields


class ReviewCreateSerializer(serializers.ModelSerializer):
    """POST — создание отзыва заказчиком. comment ограничен 2000 символами —
    лимит сознательно на уровне сериализатора, не модели (см. docstring
    Review.comment в models.py). tags — id существующих ReviewTag, список
    может быть пустым."""
    comment = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    tags = serializers.PrimaryKeyRelatedField(
        queryset=ReviewTag.objects.all(), many=True, required=False,
    )

    class Meta:
        model = Review
        fields = ["id", "rating", "comment", "tags", "created_at"]
        read_only_fields = ["id", "created_at"]
