from __future__ import annotations

import re

from rest_framework import serializers

# Мягкая проверка (не строгий формат КЗ — уточним при SMS-подтверждении):
# цифры, пробелы, скобки, дефис, необязательный ведущий +, разумная длина.
PHONE_RE = re.compile(r"^\+?[0-9 ()\-]{5,20}$")


def validate_phone_format(value: str) -> None:
    # Пример, не требование конкретного формата — валидатор мягкий и
    # принимает разные написания (77010000001, +7 (701) 123-45-67 и т.п.),
    # текст ошибки не должен читаться как «только так и никак иначе».
    if not PHONE_RE.match(value):
        raise serializers.ValidationError(
            "Введите номер телефона, например +7 701 000 00 00."
        )
