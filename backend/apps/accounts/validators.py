from __future__ import annotations

import re

from rest_framework import serializers

# Мягкая проверка (не строгий формат КЗ — уточним при SMS-подтверждении):
# цифры, пробелы, скобки, дефис, необязательный ведущий +, разумная длина.
PHONE_RE = re.compile(r"^\+?[0-9 ()\-]{5,20}$")


def validate_phone_format(value: str) -> None:
    if not PHONE_RE.match(value):
        raise serializers.ValidationError(
            "Телефон может содержать только цифры, пробелы, скобки, дефис и ведущий +."
        )
