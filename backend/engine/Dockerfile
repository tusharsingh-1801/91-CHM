FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for geospatial libraries
RUN apt-get update && apt-get install -y \
    build-essential \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Export CPLUS_INCLUDE_PATH and C_INCLUDE_PATH for GDAL
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

COPY backend/engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/engine/ ./backend/engine/

CMD ["uvicorn", "backend.engine.main:app", "--host", "0.0.0.0", "--port", "8000"]

