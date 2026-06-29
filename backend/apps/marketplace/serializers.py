from __future__ import annotations

from rest_framework import serializers
from rest_framework_gis.fields import GeometryField

from common.events import publish

from .events import BidPlaced, RequestCreated
from .models import Bid, Request, ResultFile


class ContractorBriefSerializer(serializers.Serializer):
    """Краткая карточка исполнителя — заказчик видит статус верификации в каждом отклике."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    verification_status = serializers.SerializerMethodField()

    def get_verification_status(self, user):
        profile = getattr(user, "contractor_profile", None)
        return profile.verification_status if profile else None


class BidSerializer(serializers.ModelSerializer):
    contractor = ContractorBriefSerializer(read_only=True)

    class Meta:
        model = Bid
        fields = ["id", "contractor", "comment", "status", "created_at"]
        read_only_fields = ["id", "contractor", "status", "created_at"]

    def create(self, validated_data):
        bid = super().create(validated_data)
        publish(BidPlaced(
            request_id=bid.request_id,
            bid_id=bid.id,
            contractor_id=bid.contractor_id,
        ))
        return bid


class ResultFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResultFile
        fields = ["id", "file", "original_name", "uploaded_at"]


class RequestSerializer(serializers.ModelSerializer):
    geometry = GeometryField(required=False, allow_null=True)
    bids_count = serializers.IntegerField(source="bids.count", read_only=True)
    result_files = ResultFileSerializer(many=True, read_only=True)

    class Meta:
        model = Request
        fields = [
            "id", "site", "work_type", "description", "tz_file",
            "geometry", "city", "status", "assigned_contractor",
            "result_files", "result_note", "bids_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "assigned_contractor",
            "result_files", "result_note", "bids_count",
            "created_at", "updated_at",
        ]

    def create(self, validated_data):
        validated_data["customer"] = self.context["request"].user
        request_obj = super().create(validated_data)
        publish(RequestCreated(
            request_id=request_obj.id,
            niche=request_obj.work_type,
            city=request_obj.city,
            site_id=request_obj.site_id,
        ))
        return request_obj
