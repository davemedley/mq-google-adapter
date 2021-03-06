# mq-google-adapter #
NodeJS code to integrate MQ and Google Pub Sub

Adapted from code found in the below repos:

https://github.com/googleapis/nodejs-pubsub

https://github.com/ibm-messaging/mq-mqi-nodejs

## Files ##
gcpToMQ.js - Reads from a GCP Pub Sub Subscription and puts to a fixed MQ queue. All defined on inputs.
gcpToMQTop.js- Reads from a GCP Pub Sub Subscription and puts to an MQ subscription. All defined on inputs.

mqToGCP.js- Reads from a fixed MQ queue and puts to a GCP Pub Sub Topic. All defined on inputs.
mqTopToGCP.js- Reads from an MQ Subscription and puts to a GCP Pub Sub Topic. All defined on inputs.

Other files are stock IBM / Google supplied scripts (githubs above).

## Install and Use ##
###For local MQ installs (not needed for docker as a client binding is used)###
Set the MQIJS_NOREDIST environment variable during npm install so that the Redist Client package is not downloaded and installed in the node_modules directory.
Otherwise you will get an mqrc 2058.

mqsc helper file included (QM1.mqsc). **Update the name 'dave' to you user name before running!**
Run using " runmqsc QM1 < QM1.mqsc "
(note in linux you quite often have to use " sudo su - mqm -c "runmqsc QM1 < /home/user/Downloads/QM1.mqsc" ")
To run as mqm user.

### Linux ###
export MQIJS_NOREDIST=TRUE
export GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/disco-stock-292311-5ff3c15e6c93.json (add the json security token for GCP)
(setup.sh included)

### Windows ###
set MQIJS_NOREDIST=TRUE
set GOOGLE_APPLICATION_CREDENTIALS=%CD%\disco-stock-292311-905474dc1970.json

### Google ###
Google App Creds help found here: https://cloud.google.com/docs/authentication/getting-started
Manually create a topic, a dead letter topic and a subscription in which to read from the topic.
Create a second topic for tranmission back to GCP.

## Licence ##
This is provided with no support or licence or any kind, please also refer to the licences and support provided in the above code provided elsewhere.

## Further Development ##
### Support MQ client bindings ###
Currently using local bindings, this will need chnaging otherwise the node instances will need to be on the same server as the MQ instance.
### Docker ###
To deploy in a docker container, dependant ont he above (otherwise each container needs MQ.
### Testing ###
Adding of unit tests, testing at scale, testing with multiple instances (check for race condition etc)
Check if Ack is working correctly, i.e. MQ error should not ack on Google, MQ should rollback if Google publish fails etc..
