from setuptools import setup, find_packages

setup(
    name="warera_build_helper",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "numpy",
        "pandas",
        "plotly",
        "flask",
    ],
    entry_points={
        "console_scripts": [
            "warera_build_helper=warera.main:main",
        ],
    },
)
