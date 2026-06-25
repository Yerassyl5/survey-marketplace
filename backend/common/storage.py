"""
S3-хранилище для MinIO с раздельными адресами: операции с файлами идут на
внутренний docker-хост (контейнер -> контейнер), а ссылки для пользователя
подписываются под публичный адрес, который понимает браузер.
"""
from __future__ import annotations

import boto3
from botocore.client import Config
from django.conf import settings
from storages.backends.s3 import S3Storage
from storages.utils import clean_name


class PublicURLS3Storage(S3Storage):
    def url(self, name, parameters=None, expire=None, http_method=None):
        name = self._normalize_name(clean_name(name))
        params = (parameters or {}).copy()
        params["Bucket"] = self.bucket_name
        params["Key"] = name
        if expire is None:
            expire = self.querystring_expire
        return self._public_client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=expire, HttpMethod=http_method
        )

    @property
    def _public_client(self):
        if not hasattr(self, "_public_client_cache"):
            self._public_client_cache = boto3.client(
                "s3",
                endpoint_url=settings.AWS_S3_PUBLIC_ENDPOINT_URL,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region_name,
                use_ssl=self.use_ssl,
                config=Config(
                    signature_version=self.signature_version,
                    s3={"addressing_style": self.addressing_style},
                ),
            )
        return self._public_client_cache
