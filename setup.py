from setuptools import setup, find_packages

setup(
    name="warera-war-planner",
    version="0.1.0",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "flask>=3.0",
    ],
    entry_points={
        "console_scripts": [
            "warera-war-planner=warera.main:main",
        ],
    },
)
