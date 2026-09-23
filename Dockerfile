FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8001
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home eventmatch
COPY --chown=eventmatch:eventmatch backend/ ./backend/
COPY --chown=eventmatch:eventmatch data/ ./data/
COPY --chown=eventmatch:eventmatch run.py index.html app.js api-client.js styles.css ./
USER eventmatch
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8001')+'/api/health',timeout=3)"
CMD ["python", "run.py"]
