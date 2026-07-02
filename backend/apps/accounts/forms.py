# Формы для админки кастомной модели User (email вместо username).
# Переиспользуем стандартный механизм Django (ReadOnlyPasswordHashField),
# чтобы пароль в админке нельзя было случайно сохранить открытым текстом —
# только через отдельную форму смены пароля с хешированием.
from __future__ import annotations

from django import forms
from django.contrib.auth.forms import BaseUserCreationForm, ReadOnlyPasswordHashField

from .models import User


class UserCreationForm(BaseUserCreationForm):
    class Meta(BaseUserCreationForm.Meta):
        model = User
        fields = ("email",)


class UserChangeForm(forms.ModelForm):
    password = ReadOnlyPasswordHashField(
        label="Пароль",
        help_text=(
            "Пароли не хранятся в открытом виде, поэтому нет возможности "
            "посмотреть пароль пользователя, но можно сменить его через "
            '<a href="{}">эту форму</a>.'
        ),
    )

    class Meta:
        model = User
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        password = self.fields.get("password")
        if password:
            password.help_text = password.help_text.format(f"../../{self.instance.pk}/password/")
