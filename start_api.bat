@echo off
echo Starting Excerpt API...
cd /d C:\Projects\Ashishlabs\Excerpt\apps\api
node dist\index.js >> C:\Projects\Ashishlabs\Excerpt\api_truth_test.log 2>&1
echo API exited >> C:\Projects\Ashishlabs\Excerpt\api_truth_test.log
