PATH=/www/server/nodejs/v24.12.0/bin:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

export 
export NODE_PROJECT_NAME="m24vc.com"
cd /www/wwwroot/m24vc.com
nohup /www/server/nodejs/v24.12.0/bin/node /www/wwwroot/m24vc.com/server/index.js  &>> /www/wwwlogs/nodejs/m24vc.com.log &
echo $! > /www/server/nodejs/vhost/pids/m24vc.com.pid
