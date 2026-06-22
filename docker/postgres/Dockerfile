# Стандартный шаблон Postgres не содержит pgvector — собираем поверх postgis/postgis
# (CLAUDE.md §«Инфраструктура», architecture.md §2).
ARG POSTGIS_TAG=16-3.4
FROM postgis/postgis:${POSTGIS_TAG}

ARG PGVECTOR_TAG=v0.7.4

# with_llvm=no — отключаем сборку LLVM bitcode (JIT-ускорение для расширения,
# не критично) — toolchain для thinlink (llvm-lto) недоступен в этом образе.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        git \
        postgresql-server-dev-16 \
    && git clone --branch ${PGVECTOR_TAG} --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make with_llvm=no \
    && make install with_llvm=no \
    && cd / \
    && rm -rf /tmp/pgvector \
    && apt-get purge -y --auto-remove build-essential git postgresql-server-dev-16 \
    && rm -rf /var/lib/apt/lists/*
