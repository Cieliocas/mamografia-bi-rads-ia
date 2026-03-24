#!/bin/bash

echo "Packaging project for cluster..."

# Remove old zip if exists
rm -f mammografia_code.zip

# Zip relevant directories and files
# Excluding venv, .git, .DS_Store, __pycache__, and potentially huge data folders if they are already on cluster.
# However, user asked "what files I need".
# NOTE: If the data is HUGE (CBIS-DDSM is big), zipping it might take a long time.
# I will assume the user might want to transfer code separately from data, 
# BUT for a complete package, I will include data if it's not too massive or let the user decide.
# Given the query "which files I need", I'll package the code and providing instructions for data.

# Zipping training code + docs relevantes para cluster
zip -r mammografia_code.zip src scripts requirements_cluster.txt CLUSTER_GUIDE.md README.md

echo "Code packaged into mammografia_code.zip"
echo "NOTE: Data folder is NOT included in this zip to save space/time."
echo "If you need to transfer data, zip 'data/CBIS-DDSM-JPG' separately."
