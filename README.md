## What

Forwards Teltonika GPS trackers packets to MQTT server.

Supports Home Assistant auto-discovery.

## Running

```
cp .env.template .env # and edit it
npm i
node server.js
```

## Build / publish

```
docker build . -t docker-registry-host/tracker-forwarder
docker push docker-registry-host/tracker-forwarder
```
