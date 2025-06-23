### Installation scripts

#### NOTE: don't use this unless you know what you're doing. s

This is intended for setup on a fresh Ubuntu v18.04 system. Setup may need to be modified for other linux systems.

If it says "user input", you won't want to paste anything beyond that until addressing the input.

```shell script
# Set up system

export EDITOR=vim # Option 1
export EDITOR=nano # Option 2

sudo apt update
sudo apt install -y ntp nginx software-properties-common
sudo systemctl enable ntp
sudo snap install certbot --classic
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Nginx server and SSL. Source: https://certbot.eff.org/lets-encrypt/ubuntubionic-nginx
sudo curl -o /etc/nginx/sites-available/aggie.conf https://raw.githubusercontent.com/TID-Lab/aggie/develop/docs/content/aggie-nginx
sudo ln -s /etc/nginx/sites-available/aggie.conf /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
# User input: Customize nginx settings with your domain name.
sudo $EDITOR /etc/nginx/sites-available/aggie.conf
# User input: Set up SSL with a couple of prompts.
sudo certbot --nginx

# User input: Set up SSL certificate auto-renewal.
crontab -e
# Paste the following line in crontab, replacing `X` with the current minutes + 1
# (e.g. if it's 12:15pm, write `16` instead of `X`):
X * * * * PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && sudo /usr/bin/certbot renew --no-self-upgrade > ${HOME}/certbot-cron.log 2>&1

# Then wait until that time occurs, and verify that it logged a renewal attempt:
cat ~/certbot-cron.log
# You should see something like "Cert not yet due for renewal / No renewals were attempted."
# which means the certificate is valid and the cron job is running.

# If you make any config changes later, always run this afterward:
sudo systemctl restart nginx

# Mongo DB. Source: https://docs.mongodb.com/v4.2/tutorial/install-mongodb-on-ubuntu/
wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.2.list
sudo apt update
sudo apt install -y mongodb-org zip
sudo systemctl enable mongod
# Optional: Increase ulimits via https://docs.mongodb.com/manual/reference/ulimit/.
# This will affect DB performance in some cases.
# Finally:
sudo systemctl restart mongod

# Node version manager (nvm). Source: https://github.com/nvm-sh/nvm#installing-and-updating
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
```

```shell script
# Set up Aggie

git clone https://github.com/TID-Lab/aggie.git
cd aggie
nvm install && npm install

# Ready! Test run:
npm start
# Now verify Aggie is online at your URL, then kill this process (ctrl+c) when you're done.
# Optional troubleshooting if it doesn't work:
curl localhost:3000
# This should return an HTML response starting with something like <html lang="en" ng-backend="Aggie">
# If this works but you can't access Aggie publicly, check your network config to make sure ports 80 and 443 are exposed.
```

```shell script
# Final steps

# User input: Print a script to run that will enable Aggie on startup.
npx pm2 startup
# Copy/paste the last line of output as instructed.

# Start (or restart) Aggie in the background; save the PM2 state for startup.
npm run serve
npx pm2 save

# If you ever modify .env, restart the backend by running (in the `aggie` directory):
npx pm2 restart aggie

# OPTIONAL User input: Restart Aggie every 6 hours if you have high traffic. Memory leaks are in the process of being addressed.
crontab -e
# Paste the following line in crontab:
0 */6 * * * bash -c 'source $HOME/.nvm/nvm.sh && cd $HOME/aggie && npx pm2 restart aggie > $HOME/restart-cron.log 2>&1'

# User input: Enable log rotation.
sudo $EDITOR /etc/logrotate.conf
# Paste the following, changing `/home/my_user` to the location of the `aggie` folder.
/home/my_user/.pm2/logs/*.log
/var/log/mongodb/*.log
{
  daily
  missingok
  rotate 12
  compress
  delaycompress
  notifempty
  copytruncate
}

# Whenever you need to, you can view backend logs by running (in the `aggie` directory):
npx pm2 logs
```

### Semi-automated upgrade

Save backup:

```shell script
# Back up your database.
export DATE=`date -u +"%Y-%m-%d"`; mongodump -o "mongodump-$DATE"
# OR authenticated (will prompt for your password):
export DATE=`date -u +"%Y-%m-%d"`; mongodump -o "mongodump-$DATE" -d aggie -u admin

# Compress the data to save disk space.
zip -r "mongodump-$DATE.zip" "mongodump-$DATE"
rm "mongodump-$DATE" -rf
```

Quick upgrade:

```shell script
cd aggie # Go to where you originally saved Aggie.
alias assertClean='git diff --exit-code && git diff --cached --exit-code' # Check for dirty files.
assertClean && (git pull && npm install && npx pm2 restart aggie) || echo "Dirty." # Serve the new version.
```

Full upgrade if the above fails:

```shell script
cd aggie # Go to where you originally saved Aggie.
git status # Check if anything is modified (this should be rare).
git add -A; git add -u; git stash # Save any files you may have changed.
git branch # Make sure you're on 'develop' (or whatever you need to be on).
git pull # Get upstream changes.
git stash pop # Only if you had changes saved earlier.
# ! Make sure to resolve any conflicts if there are any.
git status # Check if it looks right.
npm install # Make sure dependencies are up to date.
npx pm2 restart aggie # Serve the new version.
```
