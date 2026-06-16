import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from prophet import Prophet
from psycopg2.extras import execute_values


def round_money(value: float) -> Decimal:
    return Decimal(str(max(value, 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_daily_sales(connection) -> pd.DataFrame:
    query = '''
        SELECT
            DATE("createdAt") AS ds,
            SUM("totalAmount")::float AS y
        FROM "Order"
        WHERE "status" IN ('COMPLETED', 'SERVED')
        GROUP BY DATE("createdAt")
        ORDER BY ds ASC
    '''

    return pd.read_sql(query, connection)


def fill_missing_days(sales: pd.DataFrame) -> pd.DataFrame:
    """Expand to a continuous daily series with 0 revenue on days without orders."""
    if sales.empty:
        return sales

    frame = sales.copy()
    frame["ds"] = pd.to_datetime(frame["ds"])
    frame["y"] = frame["y"].astype(float)

    start_date = frame["ds"].min()
    end_date = pd.Timestamp.now().normalize()

    full_range = pd.date_range(start=start_date, end=end_date, freq="D")
    filled = pd.DataFrame({"ds": full_range})
    filled = filled.merge(frame[["ds", "y"]], on="ds", how="left")
    filled["y"] = filled["y"].fillna(0.0)
    return filled


def generate_forecast(data: pd.DataFrame, periods: int) -> pd.DataFrame:
    last_hist = data["ds"].max()
    yearly = len(data) >= 365

    model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=yearly,
        daily_seasonality=False,
    )
    model.fit(data)

    future = model.make_future_dataframe(periods=periods)
    forecast = model.predict(future)

    result = forecast[forecast["ds"] > last_hist][["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
    result = result.head(periods)
    result["yhat"] = result["yhat"].clip(lower=0)
    result["yhat_lower"] = result["yhat_lower"].clip(lower=0)
    result["yhat_upper"] = result["yhat_upper"].clip(lower=0)
    return result


def upsert_forecast(connection, forecast: pd.DataFrame, model_version: str) -> int:
    now = datetime.now(timezone.utc)
    rows = []

    for _, row in forecast.iterrows():
        rows.append(
            (
                row["ds"].date(),
                round_money(float(row["yhat"])),
                round_money(float(row["yhat_lower"])),
                round_money(float(row["yhat_upper"])),
                model_version,
                now,
            )
        )

    if not rows:
        return 0

    with connection.cursor() as cursor:
        cursor.execute(
            'DELETE FROM "SalesForecast" WHERE "modelVersion" = %s',
            (model_version,),
        )
        execute_values(
            cursor,
            '''
            INSERT INTO "SalesForecast"
                ("forecastDate", "predictedRevenue", "lowerBoundRevenue", "upperBoundRevenue", "modelVersion", "generatedAt")
            VALUES %s
            ''',
            rows,
        )

    connection.commit()
    return len(rows)


def main():
    load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    parsed = urlsplit(database_url)
    if parsed.query:
        supported_query = [
            (k, v)
            for k, v in parse_qsl(parsed.query, keep_blank_values=True)
            if k.lower() != "pgbouncer"
        ]
        database_url = urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, urlencode(supported_query), parsed.fragment)
        )

    forecast_days = int(os.getenv("FORECAST_DAYS", "30"))
    model_version = os.getenv("FORECAST_MODEL_VERSION", "prophet-v1")

    connection = psycopg2.connect(database_url)

    try:
        sales = get_daily_sales(connection)
        if sales.empty:
            raise RuntimeError("No historical sales data found")

        sales = fill_missing_days(sales)
        if len(sales) < 14:
            raise RuntimeError("Not enough historical sales data (need at least 14 days)")

        forecast = generate_forecast(sales, forecast_days)
        if forecast.empty:
            raise RuntimeError("Prophet did not produce any forecast rows")

        count = upsert_forecast(connection, forecast, model_version)
        last_hist = sales["ds"].max().date()
        first_fc = forecast["ds"].min().date()
        last_fc = forecast["ds"].max().date()

        print(
            f"Forecast generated successfully. "
            f"History through {last_hist}, forecast {first_fc} to {last_fc}, upserted rows: {count}"
        )
    finally:
        connection.close()


if __name__ == "__main__":
    main()
