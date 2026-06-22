FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

COPY pyproject.toml ./

RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -e ".[dev]"

COPY src ./src
COPY tests ./tests

EXPOSE 8000

CMD ["uvicorn", "flowpilot_ai_orchestrator.main:app", "--host", "0.0.0.0", "--port", "8000"]
