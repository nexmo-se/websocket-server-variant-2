'use strict'

//-------------

require('dotenv').config();

//--- for Neru installation ----
const neruHost = process.env.NERU_HOST;
console.log('neruHost:', neruHost);

//--
const express = require('express');
const bodyParser = require('body-parser')
const app = express();
const expressWs = require('express-ws')(app);
app.use(bodyParser.json());
 
// const moment = require('moment');
// const { v4: uuidv4 } = require('uuid');

// const WebSocket = require("ws");

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//---- DeepGram ASR engine ----

const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const fetch = require("cross-fetch");
const dgApiKey = process.env.DEEPGRAM_API_KEY;

//-----------------------------------------------------------

app.ws('/socket', async (ws, req) => {

  const callDirection = req.query.call_direction;
  const calleeNumber = req.query.callee_number;
  const callerNumber = req.query.caller_number;
  const participantId = req.query.participant;
  const peerUuid = req.query.peer_uuid;

  console.log('\nNew WebSocket established:');
  console.log('PSTN call direction:', callDirection);

  if (callDirection == 'outbound') {
    console.log('Callee number:', calleeNumber);
  } else {
    console.log('Caller number:', callerNumber);
  }

  console.log('Peer PSTN leg uuid:', peerUuid, '\n');

  //--

  console.log('Opening client connection to DeepGram');

  const deepgramClient = createClient(dgApiKey);

  let deepgram = deepgramClient.listen.live({       
    model: "nova-2",
    smart_format: true,      
    language: "en-US",        
    encoding: "linear16",
    sample_rate: 16000
  });

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
      // console.log(JSON.stringify(data));
      const transcript = data.channel.alternatives[0].transcript;

      if (transcript != '') {

      console.log('\n', participant, 'said:', transcript);

      }   

    });

    deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
      console.log("deepgram: disconnected");
      clearInterval(keepAlive);
      deepgram.finish();
    });

    deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
      console.log("deepgram: error received");
      console.error(error);
    });

    deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
      console.log("deepgram: warning received");
      console.warn(warning);
    });

    deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
      console.log("deepgram: metadata received");
      console.log("ws: metadata sent to client");
      // ws.send(JSON.stringify({ metadata: data }));
      console.log(JSON.stringify({ metadata: data }));
    });
  
  });

  //---------------

  ws.on('message', async (msg) => {
    
    if (typeof msg === "string") {

      console.log('>>> WebSocket text data:', msg)
    
    } else {

      if (deepgram.getReadyState() === 1 /* OPEN */) {
        deepgram.send(msg);
      } else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
        // console.log("ws: data couldn't be sent to deepgram");
        null
      } else {
        // console.log("ws: data couldn't be sent to deepgram");
        null
      }

    } 

  });

  //--

  ws.on('close', async () => {

    deepgram.finish();
    deepgram.removeAllListeners();
    deepgram = null;

    console.log("\n--- WebSocket closed");

  });

});

//-------------------------------------------------------------------------------------------

//--- If this application is hosted on Vonage serverless infrastructure
//--- VCR - Vonage Code Runtime, aka Neru

app.get('/_/health', async (req, res) => {
    res.sendStatus(200);
});

//==================================================

const port = process.env.NERU_APP_PORT || process.env.PORT || 6000;

app.listen(port, () => console.log(`WebSocket server code running on port ${port}.`));

//------------
