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

# Make port 5000 available to the world outside this container
EXPOSE 5000

# Run gunicorn when the container launches
CMD ["gunicorn", "warera.app:app", "--bind", "0.0.0.0:5000"]
