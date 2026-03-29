# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the local directory contents into the container at /app
COPY . /app

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Run the API calls at build time
RUN python -c "from warera.api import update_gear_prices_from_api, update_food_and_ammo_from_api; update_gear_prices_from_api(); update_food_and_ammo_from_api()"

# Make port available to the world outside this container
EXPOSE 10000

# Run gunicorn when the container launches
# --workers 1 to keep memory usage low on free tier
# --preload to share memory between workers if we ever increase workers
# --max-requests 50 to restart workers and prevent memory leaks
# --timeout 120 to prevent worker kills during long optimization runs
CMD ["gunicorn", "warera.app:app", "--bind", "0.0.0.0:10000", "--workers", "1", "--preload", "--max-requests", "50", "--timeout", "300"]
