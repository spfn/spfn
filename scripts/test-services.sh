#!/usr/bin/env bash
#
# Local services for integration tests.
#
# Integration tests run against the machine's own PostgreSQL and Redis rather
# than throwaway containers. PostgreSQL is shared: each package gets its own
# logical database inside the one instance. Redis cannot be shared the same way
# — the cache tests need a replication pair and a password-protected instance,
# which are per-process settings — so this script starts four small Redis
# instances on dedicated ports.
#
#   start    start the Redis instances and create the logical databases
#   stop     stop the Redis instances started here (the main 6379 is untouched)
#   status   report what is up
#
set -euo pipefail

PG_HOST="${PGHOST:-127.0.0.1}"
PG_PORT="${PGPORT:-5432}"
PG_SUPERUSER="${PGUSER:-$(whoami)}"
STATE_DIR="${SPFN_TEST_STATE_DIR:-$HOME/.spfn-test/redis}"

# port:role — 6479 standalone, 6480 master, 6481 replica of 6480, 6482 password
REDIS_PORTS=(6479 6480 6481 6482)
REDIS_MASTER_PORT=6480
REDIS_PASSWORD_PORT=6482
REDIS_TEST_PASSWORD=secret123

# The password-protected instance needs the password even to answer PING.
ping_redis()
{
    if [ "$1" = "$REDIS_PASSWORD_PORT" ]
    then
        redis-cli -p "$1" -a "$REDIS_TEST_PASSWORD" --no-auth-warning ping >/dev/null 2>&1
    else
        redis-cli -p "$1" ping >/dev/null 2>&1
    fi
}

start_redis()
{
    for port in "${REDIS_PORTS[@]}"
    do
        if ping_redis "$port"
        then
            echo "redis :$port already up"
            continue
        fi

        mkdir -p "$STATE_DIR/$port"

        local extra=()
        if [ "$port" = "$REDIS_PASSWORD_PORT" ]
        then
            extra+=(--requirepass "$REDIS_TEST_PASSWORD")
        fi
        if [ "$port" = 6481 ]
        then
            extra+=(--replicaof 127.0.0.1 "$REDIS_MASTER_PORT")
        fi

        # ${a[@]+"${a[@]}"} — an empty array is unset under `set -u` in bash 3.2,
        # which is what macOS ships.
        redis-server --port "$port" --daemonize yes --save '' --appendonly no \
            --dir "$STATE_DIR/$port" --logfile "$STATE_DIR/$port/redis.log" \
            ${extra[@]+"${extra[@]}"}

        echo "redis :$port started"
    done

    wait_for_replication
}

# The replica needs a moment to finish its first sync. Tests that read from the
# replica fail if they start before the link is up.
wait_for_replication()
{
    for _ in $(seq 1 30)
    do
        if redis-cli -p 6481 info replication 2>/dev/null | grep -q 'master_link_status:up'
        then
            echo "redis 6480→6481 replication up"
            return 0
        fi
        sleep 0.2
    done

    echo "redis 6480→6481 replication did not come up" >&2
    return 1
}

stop_redis()
{
    for port in "${REDIS_PORTS[@]}"
    do
        if [ "$port" = "$REDIS_PASSWORD_PORT" ]
        then
            redis-cli -p "$port" -a "$REDIS_TEST_PASSWORD" --no-auth-warning shutdown nosave 2>/dev/null || true
        else
            redis-cli -p "$port" shutdown nosave 2>/dev/null || true
        fi
        echo "redis :$port stopped"
    done
}

create_databases()
{
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authtest') THEN
        CREATE ROLE authtest LOGIN PASSWORD 'authtest123';
    END IF;
END $$;
SQL

    if ! psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -d postgres -Atc \
        "SELECT 1 FROM pg_database WHERE datname = 'spfn_auth_test'" | grep -q 1
    then
        psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -d postgres \
            -c "CREATE DATABASE spfn_auth_test OWNER authtest"
    fi

    echo "postgres :$PG_PORT — spfn_auth_test ready"
}

report_status()
{
    for port in "${REDIS_PORTS[@]}"
    do
        if ping_redis "$port"
        then
            echo "redis :$port — up"
        else
            echo "redis :$port — down"
        fi
    done

    replication=$(redis-cli -p 6481 info replication 2>/dev/null | grep -c 'master_link_status:up' || true)
    echo "redis 6480→6481 replication — $([ "$replication" = 1 ] && echo up || echo down)"

    databases=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -d postgres -Atc \
        "SELECT datname FROM pg_database WHERE datname = 'spfn_auth_test'" 2>/dev/null || true)
    echo "postgres :$PG_PORT — ${databases:-spfn_auth_test missing}"
}

case "${1:-start}" in
    start)
        start_redis
        create_databases
        ;;
    stop)
        stop_redis
        ;;
    status)
        report_status
        ;;
    *)
        echo "usage: $0 {start|stop|status}" >&2
        exit 1
        ;;
esac
