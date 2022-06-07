const net = require('net');
const Parser = require('teltonika-parser-fix');
const binutils = require('binutils64');
const mqtt = require('mqtt')

const topicPrefix = 'tracker';
const homeAssistantDiscoveryPrefix = 'homeassistant';
const serverStatusTopic = `${topicPrefix}/status`;

const getStateTopic = imei => `${topicPrefix}/${imei}/state`;
const getJsonAttributesTopic = imei => `${topicPrefix}/${imei}/json_attributes`;

const imeiReference = Symbol('imei');

function mqttPublish(mqttClient, topic, message, retain = true) {
    mqttClient.publish(topic, message, {retain})
    console.log(retain ? 'publish (retain)' : 'publish', topic, message);
}

function homeAssistantDiscovery(mqttClient, imei) {
    mqttPublish(mqttClient, `${homeAssistantDiscoveryPrefix}/device_tracker/gps_tracker_${imei}/config`, JSON.stringify({
        "state_topic": getStateTopic(imei),
        "availability_topic": serverStatusTopic,
        "json_attributes_topic": getJsonAttributesTopic(imei),
        "source_type": 'gps',
        "object_id": `gps_tracker_${imei}`,
        "unique_id": `gps_tracker_${imei}`
    }), false)
}

function createServer(mqttClient) {
    return net.createServer((clientConnection) => {
        console.log("client connected");

        clientConnection.on('end', () => {
            console.log("client disconnected");
        });

        clientConnection.on('data', (data) => {
            let parser = new Parser(data);
            if (parser.isImei) {
                clientConnection.write(Buffer.alloc(1, 1));
                const imei = parser.imei || 'unknown';
                clientConnection[imeiReference] = imei;
                homeAssistantDiscovery(mqttClient, imei);
            } else {
                let avl = parser.getAvl();

                for (const record of avl.records || []) {
                    const topic = `${topicPrefix}/${clientConnection[imeiReference]}`;
                    const message = JSON.stringify(record);
                    const imei = clientConnection[imeiReference];

                    mqttPublish(mqttClient, topic, message)

                    const flatProperties = Object.assign({}, record.gps, {
                        event_id: record.event_id,
                        timestamp: record.timestamp,
                        priority: record.priority
                    });
                    for (const io of record.ioElements) {
                        flatProperties['' + (io.label || io.id)] = io.valueHuman || io.value;
                    }
                    mqttPublish(mqttClient, getJsonAttributesTopic(imei), JSON.stringify(flatProperties))

                    if (record.event_id === 155) { // manual geo zone 1
                        mqttPublish(mqttClient, getStateTopic(imei), flatProperties['155'] === 1 ? 'home' : 'not_home')
                    }
                }

                let writer = new binutils.BinaryWriter();
                writer.WriteInt32(avl.number_of_data);

                let response = writer.ByteBuffer;
                clientConnection.write(response);
            }
        });
    });
}

function main() {
    require('dotenv').config()

    const mqttClient = mqtt.connect(process.env.MQTT_URL, {
        will: {
            topic: serverStatusTopic, payload: 'offline', retain: true
        }
    });

    mqttClient.on('connect', function () {
        console.log("MQTT connected");
        const server = createServer(mqttClient);
        server.listen(5000, () => {
            console.log("Server started");
            mqttPublish(mqttClient, serverStatusTopic, 'online');
        });
    });
}

main();
