# Модели отзыва/рейтинга (только после подтверждённой сделки, инвариант №1)
# и жалобы (architecture.md §4.5). Жалобы — отдельным этапом позже.
from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class ReviewTag(models.Model):
    """Справочник тегов отзыва — только положительные (architecture.md §4.5,
    по аналогии с такси), редактируется через Django Admin, без изменения кода."""
    name = models.CharField(max_length=128, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Review(models.Model):
    """Отзыв заказчика исполнителю — только после подтверждённой сделки
    (инвариант №1/№8, PRODUCT_SPEC 1.10). Один отзыв на заявку: OneToOneField
    даёт уникальность бесплатно, без отдельного unique_together — совпадает
    со спекой («после закрытия ЗАЯВКИ», не «для пары заказчик-исполнитель
    вообще»): тот же заказчик и тот же исполнитель на другой заявке — другой,
    отдельный отзыв. Гейт «только после accepted» — не здесь (на уровне БД
    его корректно не выразить, статус Request мутабелен), а во view создания
    (этап 2), тем же паттерном, что AcceptView/ReturnView."""
    # CASCADE, не PROTECT: PRODUCT_SPEC.md 1.4/1.7 безусловно разрешает
    # администратору удалить ЛЮБУЮ заявку через Django Admin («единственный
    # путь для зависшей/ошибочной заявки», без исключения для закрытых/с
    # отзывом) — PROTECT здесь заблокировал бы эту документированную
    # возможность. Отзыв без заявки бессмыслен (OneToOne — сама его суть),
    # так что каскад — не потеря данных мимо воли, а прямое следствие
    # удаления того, к чему отзыв привязан; Django Admin показывает каскад
    # на экране подтверждения удаления, администратор увидит, что сносит.
    request = models.OneToOneField(
        "marketplace.Request", on_delete=models.CASCADE, related_name="review",
    )
    # Денормализовано из request.assigned_contractor — ради быстрого агрегата
    # «все отзывы этого исполнителя» (Avg/Count) без обхода через Request на
    # каждый запрос (architecture.md §4.5: «рейтинг считается на лету агрегатом
    # по Review»). Поле корректно РОВНО до тех пор, пока в системе нет
    # переназначения исполнителя после award — сейчас assigned_contractor
    # пишется один раз в AwardView и нигде больше не меняется (подтверждено
    # грепом по всему backend). Если переназначение когда-либо появится — это
    # поле придётся чинить синхронно с ним.
    #
    # on_delete=PROTECT, хотя соседние FK на User в проекте используют
    # CASCADE/SET_NULL (Bid.contractor — CASCADE, Request.assigned_contractor —
    # SET_NULL) — разница осознанная: удаление пользователя нигде в спеке не
    # санкционировано (в отличие от удаления Request, см. комментарий выше),
    # а отзыв по решению продукта — постоянная публичная запись доверия
    # («скрывать нельзя»), не разовые операционные данные вроде Bid. Если
    # понадобится удалить аккаунт исполнителя с отзывами — это должно быть
    # осознанным решением администратора (ProtectedError), не побочным
    # эффектом чистки аккаунтов.
    contractor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reviews_received",
    )
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    # Лимит длины (2000 симв.) — на уровне сериализатора (этап 2), не здесь:
    # модель хранит то, что уже прошло валидацию, TextField без max_length —
    # тот же принцип, что у result_note/description в marketplace.
    comment = models.TextField(blank=True)
    tags = models.ManyToManyField(ReviewTag, blank=True, related_name="reviews")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Отзыв на заявку #{self.request_id} — {self.rating}★"
