# Dockerfile for Track Star MVP
FROM python:3.11-slim

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Copy only requirements first for faster rebuilds
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the rest of the source
COPY . /app

# Expose port (configurable via PORT env var)
ENV PORT=5000
EXPOSE 5000

# Use gunicorn for a production-ish server; fallback to python when not available
CMD ["gunicorn", "backend.app:app", "--bind", "0.0.0.0:5000", "--workers", "1"]
