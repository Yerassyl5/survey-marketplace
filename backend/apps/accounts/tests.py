"""Верификация исполнителя: пересдача документов сбрасывает решение модератора."""
from __future__ import annotations

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ContractorProfile, Role, User, VerificationStatus


def make_contractor(email="contractor@test.kz", verification_status=VerificationStatus.PENDING, rejection_reason=""):
    user = User.objects.create_user(
        email=email, password="pass", role=Role.CONTRACTOR,
        person_type="individual", full_name="Исполнитель Тест", phone="700",
    )
    ContractorProfile.objects.create(
        user=user, verification_status=verification_status, rejection_reason=rejection_reason,
    )
    return user


class ContractorDocumentReuploadTests(TestCase):
    def setUp(self):
        self.client_e = APIClient()

    def _patch_documents(self):
        scan = SimpleUploadedFile("license.pdf", b"fake pdf content", content_type="application/pdf")
        return self.client_e.patch(
            "/api/accounts/contractor/documents/", {"license_scan": scan}, format="multipart",
        )

    def test_reupload_resets_rejected_to_pending(self):
        contractor = make_contractor(
            verification_status=VerificationStatus.REJECTED, rejection_reason="Скан лицензии нечитаем.",
        )
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.verification_status, VerificationStatus.PENDING)

    def test_reupload_resets_verified_to_pending(self):
        contractor = make_contractor(verification_status=VerificationStatus.VERIFIED)
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.verification_status, VerificationStatus.PENDING)

    def test_reupload_from_pending_stays_pending(self):
        contractor = make_contractor(verification_status=VerificationStatus.PENDING)
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.verification_status, VerificationStatus.PENDING)

    def test_reupload_clears_rejection_reason(self):
        contractor = make_contractor(
            verification_status=VerificationStatus.REJECTED, rejection_reason="Скан лицензии нечитаем.",
        )
        self.client_e.force_authenticate(contractor)
        r = self._patch_documents()
        self.assertEqual(r.status_code, 200)
        contractor.contractor_profile.refresh_from_db()
        self.assertEqual(contractor.contractor_profile.rejection_reason, "")
