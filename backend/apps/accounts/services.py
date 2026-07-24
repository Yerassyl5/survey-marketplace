"""
Публичная граница модуля accounts (architecture.md §1 — «публичные сервисы
модулей в памяти»). Другие модули читают данные пользователей ТОЛЬКО через
функции этого файла, не импортируя accounts.models напрямую — по образцу
marketplace.services/reputation.services.

Особенно важно для notifications: тот модуль подписан на события всех
остальных приложений и со временем будет читать данные из них всех — без
явной границы здесь он бы через полгода знал внутренности всего проекта
(разведка перед этапом 1 блока 1.11, docs/progress.md).
"""
from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core import signing
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import User

# Домен подписи отдельный от других будущих signed-токенов (например,
# сброса пароля, этап 5) — salt разводит их так, что токен одного
# назначения нельзя скормить проверке другого, даже структурно совпадающей
# по формату (просто {"user_id": int}).
EMAIL_VERIFICATION_SALT = "accounts.email-verification"
# 3 суток — подтверждение почты менее чувствительно ко времени, чем сброс
# пароля (протухшая ссылка стоит лишнего клика «отправить повторно», не
# риска угона аккаунта); более длинное окно снижает нагрузку на
# поддержку от тех, кто открывает почту не в тот же день (решение
# пользователя, этап 3 блока 1.11).
EMAIL_VERIFICATION_TTL = 60 * 60 * 24 * 3


class EmailVerificationTokenExpired(Exception):
    """Токен подписан верно, но истёк TTL (django.core.signing.SignatureExpired)."""


class EmailVerificationTokenInvalid(Exception):
    """Токен испорчен/подделан (django.core.signing.BadSignature) либо
    структурно не то, что мы подписывали."""


@dataclass(frozen=True)
class ContactInfo:
    """Публичный тип границы модуля — email/имя пользователя для писем и
    т.п., без раскрытия остальных полей User (роль, ИИН/БИН, статус
    верификации и т.д.) вызывающему коду."""
    email: str
    full_name: str


def get_contact_info(user_id: int) -> ContactInfo | None:
    """None, если пользователь не найден — вызывающий код сам решает, что
    делать (пропустить письмо, залогировать), не получает исключение из
    чужого модуля."""
    user = User.objects.filter(pk=user_id).only("email", "full_name").first()
    if user is None:
        return None
    return ContactInfo(email=user.email, full_name=user.full_name)


def generate_email_verification_token(user_id: int) -> str:
    """Stateless — HMAC на SECRET_KEY через django.core.signing, без записи
    в БД: подтверждение почты идемпотентно (повторная простановка True не
    вредна, в отличие от смены пароля), значит не нужен ни одноразовый
    расход токена, ни чистка просроченных записей. НЕ django.contrib.auth.
    tokens.PasswordResetTokenGenerator — тот завязан на user.password И
    user.last_login (_make_hash_value), значит вход с ДРУГОГО устройства
    между письмом и кликом по ссылке меняет last_login и преждевременно
    инвалидирует токен, хотя к подтверждению почты это не имеет отношения
    — для сброса пароля такая привязка к last_login задумана как защита,
    для этой задачи это дефект, найденный при планировании этапа 3."""
    return signing.dumps({"user_id": user_id}, salt=EMAIL_VERIFICATION_SALT)


def verify_email_verification_token(token: str) -> int:
    """Возвращает user_id при успехе. EmailVerificationTokenExpired/
    EmailVerificationTokenInvalid — различимые исключения, не одно общее:
    фронту (этап 4) пригодятся разные тексты («ссылка устарела, запросите
    новую» vs «ссылка повреждена»)."""
    try:
        payload = signing.loads(token, salt=EMAIL_VERIFICATION_SALT, max_age=EMAIL_VERIFICATION_TTL)
    except signing.SignatureExpired:
        raise EmailVerificationTokenExpired
    except signing.BadSignature:
        raise EmailVerificationTokenInvalid
    try:
        return int(payload["user_id"])
    except (KeyError, TypeError, ValueError):
        raise EmailVerificationTokenInvalid


# --- Сброс пароля ---
#
# В отличие от EMAIL_VERIFICATION_* выше, здесь сознательно используется
# django.contrib.auth.tokens.PasswordResetTokenGenerator, а не голый
# signing.dumps: тот генератор строит хэш из user.password И user.last_login
# (_make_hash_value) — для подтверждения почты это было дефектом (см.
# выше), для сброса пароля это ровно нужное свойство: смена пароля сама
# инвалидирует все не использованные ссылки сброса, без отдельной модели
# токенов с ручной чисткой просроченных записей.
#
# PasswordResetTokenGenerator.check_token() не различает «истёк» и
# «подделан» — оба случая возвращают False. Различение нужно по UX-причине
# (TTL всего 1 час, случай «открыл письмо через два часа» частый, и ответ
# должен объяснять, что произошло, а не пугать «ссылка недействительна»,
# решение пользователя). Вместо обращения к приватным методам генератора
# (нестабильная опора между версиями Django) весь токен ОБОРАЧИВАЕТСЯ в
# тот же signing.dumps/loads, что и EMAIL_VERIFICATION-токен выше:
# внешний конверт даёт различимые исключения (SignatureExpired/
# BadSignature) через полностью публичный API, внутренний Django-токен
# остаётся только ради самоинвалидации при смене пароля/last_login —
# оба слоя проверяются независимо.
PASSWORD_RESET_SALT = "accounts.password-reset"
# 1 час — самый чувствительный токен в системе (даёт смену пароля, то
# есть фактический захват аккаунта), короче TTL подтверждения почты
# (3 суток), у которого такого риска нет (решение пользователя).
PASSWORD_RESET_TTL = 60 * 60

_password_reset_token_generator = PasswordResetTokenGenerator()


class PasswordResetTokenExpired(Exception):
    """Внешний конверт (signing) устарел — TTL 1 час истёк."""


class PasswordResetTokenInvalid(Exception):
    """Конверт структурно испорчен/подделан/под чужим salt, либо в payload
    нет такого пользователя. Не путать с PasswordResetTokenAlreadyUsed
    ниже — там конверт настоящий (подписан нашим SECRET_KEY, иначе внешняя
    подпись не сошлась бы вообще), просто внутренний Django-токен больше
    не совпадает."""


class PasswordResetTokenAlreadyUsed(Exception):
    """Внешний конверт цел и свеж (не истёк, не подделан), но внутренний
    PasswordResetTokenGenerator.check_token() не совпал — пароль (или
    last_login) сменился с момента выдачи ссылки.

    Разведено с PasswordResetTokenInvalid намеренно (не декоративно):
    фронт (этап 3) должен объяснять человеку разные ситуации по-разному —
    «ссылка недействительна/подделана» пугает того, кто просто открыл
    письмо через два часа ПОСЛЕ того, как уже сменил пароль другим путём
    (или кликнул по старой ссылке после реального использования).

    Формулировка вправе быть КОНКРЕТНОЙ («пароль уже был изменён»), не
    обобщённой («что-то изменилось») — проверено фактом, не
    предположением: api_settings.UPDATE_LAST_LOGIN == False в этом
    проекте (SIMPLE_JWT в settings.py не переопределяет дефолт), и
    единственный вызов update_last_login() в LoginSerializer.validate()
    стоит за этим же флагом, то есть не вызывается никогда. Ни одного
    другого места в backend/apps/, которое трогало бы last_login, нет
    (grep). Значит last_login для обычного пользователя API не меняется
    в принципе — единственная практическая причина несовпадения здесь
    это смена пароля, «вошли с другого устройства» для этой аудитории не
    сценарий. (Теоретическое исключение — вход сотрудника в Django Admin
    через сессию, которая шлёт user_logged_in — не относится к аудитории
    сброса пароля через публичный сайт, в пользовательский текст не
    выносится.)"""


def generate_password_reset_token(user: User) -> str:
    inner_token = _password_reset_token_generator.make_token(user)
    return signing.dumps({"user_id": user.id, "token": inner_token}, salt=PASSWORD_RESET_SALT)


def verify_password_reset_token(token: str) -> User:
    """Возвращает User при успехе. Raises PasswordResetTokenExpired/
    PasswordResetTokenInvalid/PasswordResetTokenAlreadyUsed — три
    различимых исключения (не два, как у verify_email_verification_token)
    ради разных текстов на фронте (этап 3): «истёк» vs «подделан» vs
    «пароль уже сменили»."""
    try:
        payload = signing.loads(token, salt=PASSWORD_RESET_SALT, max_age=PASSWORD_RESET_TTL)
    except signing.SignatureExpired:
        raise PasswordResetTokenExpired
    except signing.BadSignature:
        raise PasswordResetTokenInvalid
    try:
        user_id = int(payload["user_id"])
        inner_token = str(payload["token"])
    except (KeyError, TypeError, ValueError):
        raise PasswordResetTokenInvalid
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        raise PasswordResetTokenInvalid
    if not _password_reset_token_generator.check_token(user, inner_token):
        raise PasswordResetTokenAlreadyUsed
    return user


def blacklist_all_refresh_tokens(user: User) -> None:
    """Вызывается и сменой пароля залогиненным (ChangePasswordView), и
    сбросом пароля по ссылке (этап 2) — второе место использования
    оправдывает вынос из вьюхи: все устройства требуют повторного входа
    после любой смены пароля, независимо от пути."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)
