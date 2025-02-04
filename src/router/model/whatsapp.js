"use strict";

// const { default: makeWASocket, makeWALegacySocket, downloadContentFromMessage } = require('@adiwajshing/baileys')
// const { useSingleFileAuthState, makeInMemoryStore, fetchLatestBaileysVersion, AnyMessageContent, delay, MessageRetryMap, useMultiFileAuthState } = require('@adiwajshing/baileys')
// const { DisconnectReason } = require('@adiwajshing/baileys')
const {
  default: makeWASocket,
  makeInMemoryStore,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  downloadContentFromMessage,
  DisconnectReason,
  proto,
} = require("baileys");
const QRCode = require("qrcode");

const lib = require("../../lib");
const fs = require("fs");
let sock = [];
let qrcode = [];
let intervalStore = [];
let intervalConnCheck = [];
let counterQr = [];
let chachedMsg = [];

const axios = require("axios");

/***********************************************************
 * FUNCTION
 **********************************************************/
const MAIN_LOGGER = require("../../lib/pino");
const json = require("body-parser/lib/types/json");
const { useSQLiteAuthState } = require("./sqliteAuthState");
const logger = MAIN_LOGGER.child({ level: "info" });

const msgRetryCounterMap = () => (MessageRetryMap = {});

// start a connection
const connectToWhatsApp = async (token, io) => {
  try {
    if (typeof qrcode[token] !== "undefined") {
      console.log(`> QRCODE ${token} IS READY`);
      return {
        status: false,
        sock: sock[token],
        qrcode: qrcode[token],
        message: "Please scann qrcode",
      };
    }

    try {
      let number = sock[token].user.id.split(":");
      number = number[0] + "@s.whatsapp.net";
      const ppUrl = await getPpUrl(token, number);
      io.emit("connection-open", { token, user: sock[token].user, ppUrl });
      if (ppUrl != false) {
        return { status: true, message: "Already connected" };
      } else {
        io.emit("message", { token, message: `Try to connecting ${token}` });
        console.log(`Try to connecting ${token}`);
        winstonLog({
          tag: "connect",
          token: token,
          json: {
            tag: "manageIncomingMessage",
            message: `Try to connecting ${token}`,
            data: "PpUrl false",
          },
        });
      }
    } catch (error) {
      io.emit("message", { token, message: `Try to connecting Error ${token} ${error}` });
      console.log(`Try to connecting ${token}`);
      winstonLog({
        tag: "connect",
        token: token,
        json: {
          tag: "manageIncomingMessage",
          message: `Try to connecting ${token}`,
          data: error,
        },
      });
    }

    const { state, saveCreds } = await useSQLiteAuthState(
      `credentials/auth.db`,token
    );

    // fetch latest version of Chrome For Linux
    const chrome = await getChromeLates();
    console.log(
      `Token: ${token} using Chrome v${
        chrome?.data?.versions[0]?.version
      }, isLatest: ${chrome?.data?.versions.length > 0 ? true : false}`
    );

    // fetch latest version of WA Web
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(
      `Token: ${token} using WA v${version.join(".")}, isLatest: ${isLatest}`
    );

    // the store maintains the data of the WA connection in memory
    // can be written out to a file & read from it
    // const store = makeInMemoryStore({ logger })
    // store?.readFromFile(`credentials/${token}/multistore.js`)
    // {"chats":[],"contacts":{},"messages":{}}

    // interval
    // intervalStore[token] = setInterval(() => {
    //     try {
    //         store?.writeToFile(`credentials/${token}/multistore.js`)
    //     } catch (error) {
    //         console.log(error)
    //     }
    // }, 10_000)

    clearInterval(intervalConnCheck[token]);
    intervalConnCheck[token] = setInterval(async () => {
      try {
        log.info(`Reconnectingsession2 ${token}`);
        const check = await connectToWhatsApp(token, io);
        console.log(`> Interval check connection TOKEN: ${token}`, check);
      } catch (error) {
        winstonLog({
          tag: "IntervalCheck",
          token: token,
          json: {
            tag: "errorConnectWhatsapp",
            message: "Interval check connection",
            data: error,
          },
        });
      }
    }, 10000);
    if(sock[token]){
      console.log(`deleting socket ${token}`)
      sock[token].ev.removeAllListeners()
      delete sock[token];
      console.log(`done deleting socket ${token}`)
    } 
    sock[token] = makeWASocket({
      version,
      // browser: ['Linux', 'Chrome', '103.0.5060.114'],
      // browser: Browsers.macOS('Ubuntu'),
      browser: [
        "Linux",
        "Chrome",
        chrome?.data?.versions[0]?.version || "103.0.5060.114",
      ],
      syncFullHistory: true,
      markOnlineOnConnect: false,
      downloadHistory: true,
      logger,
      qrTimeout: 20000,
      defaultQueryTimeoutMs: undefined,
      printQRInTerminal: true,
      shouldIgnoreJid: (jid) => {
        winstonLog({
          tag: "logJid",
          token: token,
          json: {
            tag: "Jid",
            message: `Jid = ${jid}`,
            data: jid,
          },
        });
        if(jid){
          try{
            if (jid.endsWith("@newsletter") || jid.endsWith("@broadcast")) {
              return true;
            } else {
              return false;
            }
          }catch(error){
            return false;
          }
        }else{
          return false;
        }
      },
      auth: state,
      level: "silent",
      msgRetryCounterMap,
      getMessage: async (key) => {
        try {
          let msg = await readJsonFromFile({ token, name: "messages" });
          msg = msg.json.messages.filter((x) => x.key.id === key.id);
          return msg.message;
        } catch (error) {
          try {
            var msgc = chachedMsg.filter((x) => x.key.id === key.id);
            return msgc.message;
          } catch (err) {
            winstonLog({
              tag: "getMessage",
              token: token,
              json: {
                tag: "error-resend-message",
                message: "error resend message",
                data: {
                  token: token,
                  error: error,
                },
              },
            });
            return {
              conversation:
                "Hello, this is resending message. But my message was lost. Please reply this message to tell me the message is lost.\n\nRegard web dev *nobox.id*",
            };
          }
        }
      },
    });

    // store?.bind(sock[token].ev)

    sock[token].ev.process(
      // events is a map for event name => event data
      async (events) => {
        try {
          console.log("events",events)
          // something about the connection changed
          // maybe it closed, or we received all offline message or connection opened
          if (events["connection.update"]) {
            const update = events["connection.update"];
            const { connection, lastDisconnect, qr,receivedPendingNotifications  } = update;

            // winstonLog({
            //   tag: "connection.update",
            //   token: token,
            //   json: {
            //     tag: "connection.update",
            //     message: connection,
            //     data: {
            //       token: token,
            //       update: update,
            //     },
            //   },
            // });

            // CONNECTION CLOSE
            if (connection === "close") {
              console.log(
                `Closing Bos ${token} ${lastDisconnect?.error?.output?.statusCode}`
              );
              delete qrcode[token];
              if (
                lastDisconnect?.error?.output?.statusCode ==
                  DisconnectReason.loggedOut
              ) {
                try {
                  await clearConnection(token);
                  io.emit("connection-close", {
                    token: token,
                    message: "Connecting",
                  });
                  log.info(`Reconnectingsession3 ${token}`);
                  await connectToWhatsApp(token, io);
                  return null;
                } catch (error) {
                  var er = error;
                  winstonLog({
                    tag: "errorReconnect",
                    token: token,
                    json: {
                      tag: "errorrConnectWhatsapp",
                      message: "LogOut BadSession",
                      data: error,
                    },
                  });
                }
              } else if (
                lastDisconnect?.error?.output?.statusCode ==
                  DisconnectReason.connectionLost ||
                lastDisconnect?.error?.output?.statusCode ==
                  DisconnectReason.timedOut
              ) {
                // console.log(
                //   `Connection Lost ${lastDisconnect?.error?.output?.statusCode}`
                // );
                // try {
                //   io.emit("connection-close", {
                //     token: token,
                //     message: "Connecting",
                //   });
                //   log.info(`Reconnectingsession4 ${token}`);
                //   await connectToWhatsApp(token, io);
                //   return null;
                // } catch (error) {
                //   var er = error;
                //   winstonLog({
                //     tag: "errorReconnect",
                //     token: token,
                //     json: {
                //       tag: "errorrConnectWhatsapp",
                //       message: "LogOut BadSession",
                //       data: error,
                //     },
                //   });
                // }
              } else if (
                lastDisconnect?.error?.output?.statusCode ==
                  DisconnectReason.connectionReplaced
              ) {
                // console.log(
                //   `Connection Replaced ${lastDisconnect?.error?.output?.statusCode}`
                // );
                // try {
                //   io.emit("connection-close", {
                //     token: token,
                //     message: "Connecting",
                //   });
                //   log.info(`Reconnectingsession4 ${token}`);
                //   await connectToWhatsApp(token, io);
                //   return null;
                // } catch (error) {
                //   var er = error;
                //   winstonLog({
                //     tag: "errorReconnect",
                //     token: token,
                //     json: {
                //       tag: "errorrConnectWhatsapp",
                //       message: "LogOut BadSession",
                //       data: error,
                //     },
                //   });
                // }
              } else if (
                lastDisconnect?.error?.output?.statusCode ==
                  DisconnectReason.restartRequired
              ) {
                // try {
                //   io.emit("connection-close", {
                //     token: token,
                //     message: "Connecting",
                //   });
                //   log.info(`Reconnectingsession4 ${token}`);
                //   await connectToWhatsApp(token, io);
                //   return null;
                // } catch (error) {
                //   var er = error;
                //   winstonLog({
                //     tag: "errorReconnect",
                //     token: token,
                //     json: {
                //       tag: "errorrConnectWhatsapp",
                //       message: "LogOut BadSession",
                //       data: error,
                //     },
                //   });
                // }
              } else {
                // try {
                //   io.emit("connection-close", {
                //     token: token,
                //     message: "Connecting",
                //   });
                //   log.info(`Reconnectingsession4 ${token}`);
                //   await connectToWhatsApp(token, io);
                //   return null;
                // } catch (error) {
                //   var er = error;
                //   winstonLog({
                //     tag: "errorReconnect",
                //     token: token,
                //     json: {
                //       tag: "errorrConnectWhatsapp",
                //       message: "LogOut BadSession",
                //       data: error,
                //     },
                //   });
                // }
                // console.log(
                //   `Connection Closed Else ${lastDisconnect?.error?.output?.statusCode}`
                // );
                // try {
                //   log.info(`Reconnectingsession4 ${token}`);
                //   await connectToWhatsApp(token, io);
                //   io.emit("connection-close", {
                //     token: token,
                //     message: "Connecting",
                //   });
                // } catch (error) {
                //   console.log(
                //     `Error Bos ${lastDisconnect?.error?.output?.statusCode}`
                //   );
                //   winstonLog({
                //     tag: "errorReconnect",
                //     token: token,
                //     json: {
                //       tag: "errorConnectWhatsapp",
                //       message: `Disconnect Code ${lastDisconnect?.error?.output?.statusCode}`,
                //       data: error,
                //     },
                //   }); // Retry the loop on error
                // }
              }
              // else if (
              //   lastDisconnect?.error?.output?.statusCode !==
              //   DisconnectReason.connectionClosed
              // ) {
              //   try {
              //     await connectToWhatsApp(token, io);
              //   } catch (error) {
              //     var er = error;
              //   }
              // } else if (reason === DisconnectReason.connectionReplaced) {
              //   try {;
              //     await connectToWhatsApp(token, io);
              //   } catch (error) {
              //     var er = error;
              //   }
              // } else {
              //   try {
              //     await connectToWhatsApp(token, io);
              //     io.emit("connection-close", {
              //       token: token,
              //       message: "Connecting",
              //     });
              //   } catch (error) {
              //     var er = error;
              //   }
              // }
            }

            // QRCODE
            if (qr) {
              counterQr[token] = counterQr[token] || 0;
              // if ( counterQr[token] >= 5 ) {
              //   io.emit('connection-close', { token: token, message: 'QR CODE Time Out'})
              //   return await clearConnection(token)
              // }
              counterQr[token]++;
              QRCode.toDataURL(qr, function (err, url) {
                if (err) {
                  logger.error(err);
                }
                qrcode[token] = url;
                try {
                  io.emit("qrcode", {
                    token,
                    data: url,
                    message:
                      "Qrcode updated, please scann with your Whatsapp Device",
                  });
                } catch (error) {
                  lib.log.error(error);
                }
              });
            }

            // CONNECTION OPEN
            if (connection === "open") {
              if (receivedPendingNotifications && !sock[token].authState.creds?.myAppStateKeyId){
                sock[token].ev.flush() // this
              }
              logger.info("opened connection");
              logger.info(sock[token].user);
              await sock[token].sendPresenceUpdate("unavailable");

              let number = sock[token].user.id.split(":");
              number = number[0] + "@s.whatsapp.net";

              const ppUrl = await getPpUrl(token, number);
              io.emit("connection-open", {
                token,
                user: sock[token].user,
                ppUrl,
              });
              delete qrcode[token];
            }

            // DON't DELETE THIS FOR BACKUP
            // if ( lastDisconnect?.error) {
            //     if ( lastDisconnect.error.output.statusCode !== 408 || lastDisconnect.error.output.statusCode !== 515 ) {
            //         delete qrcode[token]
            //         connectToWhatsApp(token, io)
            //         io.emit('message', {token: token, message: "Reconnecting"})
            //     } else {
            //         io.emit('message', {token: token, message: lastDisconnect.error.output.payload.message, error: lastDisconnect.error.output.payload.error})
            //         delete qrcode[token]
            //         await clearConnection(token)
            //     }
            // }

            // console.log(`connection update TOKEN: ${token} ${new Date()}`, update)
          }

          // credentials updated -- save them
          if (events["creds.update"]) {
            try{
              await saveCreds();
            }catch(error){
              console.log(error)
            }
          }

          if (events.call) {
            console.log(`Token: ${token} recv call event`, events.call);
            winstonLog({
              tag: "call",
              token: token,
              json: {
                tag: "call",
                message: "chats set",
                data: {
                  token: token,
                  call: events.call,
                },
              },
            });
            manageIncomingMessage({ token, upsert: events.call, io });
          }

          // chat history received
          if (events["chats.set"]) {
            const { chats, isLatest } = events["chats.set"];
            console.log(
              `Token: ${token} event recv ${chats.length} chats (is latest: ${isLatest})`
            );
            winstonLog({
              tag: "chats.set",
              token: token,
              json: {
                tag: "chats.set",
                message: "chats set",
                data: {
                  token: token,
                  chatsSet: { chats, isLatest },
                },
              },
            });
            writeJsonToFile({
              token: token,
              name: "chats",
              json: { chats, isLatest },
            });
          }
          if (events["chats.upsert"]) {
            console.log("chats.upsert",events["chats.upsert"])
            const { chats, isLatest } = events["chats.set"];
            console.log(
              `Token: ${token} event recv ${chats.length} chats (is latest: ${isLatest})`
            );
            winstonLog({
              tag: "chats.upsert",
              token: token,
              json: {
                tag: "chats.upsert",
                message: "chats set",
                data: {
                  token: token,
                  chatsSet: { chats, isLatest },
                },
              },
            });
            writeJsonToFile({
              token: token,
              name: "chats",
              json: { chats, isLatest },
            });
          }
          if (events["messaging-history.set"]) {
            const { contacts, isLatest } = events["messaging-history.set"];
            writeJsonToFile({
              token: token,
              name: "contacts",
              json: { contacts, isLatest },
            });
          }


          // message history received
          if (events["messages.set"]) {
            const { messages, isLatest } = events["messages.set"];
            winstonLog({
              tag: "messages-set",
              token: token,
              json: {
                tag: "messages-set",
                message: "messages set",
                data: {
                  token: token,
                  messagesSet: { messages, isLatest },
                },
              },
            });
            writeJsonToFile({
              token: token,
              name: "messages",
              json: { messages, isLatest },
            });
            manageIncomingMessage({
              token,
              upsert: events["messages.set"],
              io,
            });
          }

          if (events["contacts.set"]) {
            const { contacts, isLatest } = events["contacts.set"];
            winstonLog({
              tag: "contacts-upsert",
              token: token,
              json: {
                tag: "contacts-upsert",
                message: "contacts upsert",
                data: {
                  token: token,
                  contactsSet: { contacts, isLatest },
                },
              },
            });
            writeJsonToFile({
              token: token,
              name: "contacts",
              json: { contacts, isLatest },
            });
            manageIncomingMessage({
              token,
              upsert: events["contacts.set"],
              io,
            });
          }

          if (events["contacts.update"]) {
            const { contacts, isLatest } = events["contacts.update"];
            writeJsonToFile({
              token: token,
              name: "contacts",
              json: { contacts, isLatest },
            });
          }

          if (events["contacts.upsert"]) {
            const { contacts, isLatest } = events["contacts.upsert"];
            winstonLog({
              tag: "contacts-upsert",
              token: token,
              json: {
                tag: "contacts-upsert",
                message: "contacts upsert",
                data: {
                  token: token,
                  contactsSet: { contacts, isLatest },
                },
              },
            });
            writeJsonToFile({
              token: token,
              name: "contacts",
              json: { contacts, isLatest },
            });
            manageIncomingMessage({
              token,
              upsert: events["contacts.set"],
              io,
            });
          }

          // received a new message
          if (events["messages-upsert"]) {
            manageIncomingMessage({
              token,
              upsert: events["messages.upsert"],
              io,
            });
          }

          // messages updated like status delivered, message deleted etc.
          if (events["messages.update"]) {
            winstonLog({
              tag: "messages-update",
              token: token,
              json: {
                tag: "messages-update",
                message: "messages update",
                data: {
                  token: token,
                  messagesUpdate: events["messages.update"],
                },
              },
            });
            manageIncomingMessage({
              token,
              upsert: events["messages.update"],
              io,
            });
          }

          if (events["message-receipt.update"]) {
            console.log(
              `Token: ${token} message receipt update`,
              events["message-receipt.update"]
            );
            winstonLog({
              tag: "message-receipt.update",
              token: token,
              json: {
                tag: "message-receipt.update",
                message: "message receipt update",
                data: {
                  token: token,
                  messageReceiptUpdate: events["message-receipt.update"],
                },
              },
            });
            manageIncomingMessage({
              token,
              upsert: events["message-receipt.update"],
              io,
            });
          }

          if (events["messages.reaction"]) {
            console.log(
              `Token: ${token} messages reaction`,
              events["messages.reaction"]
            );
            winstonLog({
              tag: "messages-reaction",
              token: token,
              json: {
                tag: "messages-reaction",
                message: "messages reaction",
                data: {
                  token: token,
                  messagesReaction: events["messages.reaction"],
                },
              },
            });
            manageIncomingMessage({
              token,
              upsert: events["messages.reaction"],
              io,
            });
          }

          if (events["presence.update"]) {
            console.log(
              `Token: ${token} presence.update`,
              events["presence.update"]
            );
            winstonLog({
              tag: "presence.update",
              token: token,
              json: {
                tag: "presence.update",
                message: "messages reaction",
                data: {
                  token: token,
                  presenceUpdate: events["presence.update"],
                },
              },
            });
            manageIncomingMessage({
              token,
              upsert: events["presence.update"],
              io,
            });
          }

          if (events["chats.update"]) {
            console.log(`Token: ${token} chats update`, events["chats.update"]);
            winstonLog({
              tag: "chats-update",
              token: token,
              json: {
                tag: "chats-update",
                message: "chats update",
                data: {
                  token: token,
                  chatsUpdate: events["chats.update"],
                },
              },
            });
            manageIncomingMessage({
              token,
              upsert: events["chats.update"],
              io,
            });
          }

          if (events["chats.delete"]) {
            console.log(
              `Token: ${token} chats deleted`,
              events["chats.delete"]
            );
            winstonLog({
              tag: "chats-delete",
              token: token,
              json: {
                tag: "chats-delete",
                message: "chats delete",
                data: {
                  token: token,
                  chatsDelete: events["chats.delete"],
                },
              },
            });
            manageIncomingMessage({
              token,
              upsert: events["chats.delete"],
              io,
            });
          }
        } catch (error) {
          console.log("Send Socket message error");
          winstonLog({
            tag: "sendSocket",
            token: token,
            json: {
              tag: "",
              message: "Send Socket message error",
              data: error,
            },
          });
        }
      }
    );

    sock[token].ev.on("messages.upsert", (m) => {
      manageIncomingMessage({ token, upsert: m, io });
    });

    sock[token].onUnexpectedError((error, msg) => {
      console.log("error disini");
      console.log(error);
      console.log(msg);
    });

    return {
      sock: sock[token],
      qrcode: qrcode[token],
    };
  } catch (error) {
    console.log("ConnectToWhatsapp error",error);
    winstonLog({
      tag: "connectWhatsApp",
      token: token,
      json: {
        tag: "",
        message: "ConnectToWhatsapp error",
        data: error,
      },
    });
  }
};

// text message
async function sendText(token, number, text, replyToMessageId, participantId) {
  try {
    if (Array.isArray(number)) {
      for (let i = 0; i < number.length; i++) {
        const random = Math.floor(
          Math.random() * (process.env.MAX - process.env.MIN + 1) +
            process.env.MIN
        );
        const delay = i * 1000 * random;
        setTimeout(async () => {
          const sendingTextMessage = await sock[token].sendMessage(number[i], {
            text: text,
          });
        }, delay);
      }
      return `Sending ${number.length} message start`;
    } else {
      var reply = {};
      if (replyToMessageId) {
        if (number.includes("@g.us")) {
          reply = {
            quoted: {
              key: {
                id: replyToMessageId,
                remoteJid: number,
                participant: participantId,
              },
              message: { conversation: "" },
            },
          };
        } else {
          reply = {
            quoted: {
              key: { id: replyToMessageId, remoteJid: number },
              message: { conversation: "" },
            },
          };
        }
      }
      console.log(reply);
      const sendingTextMessage = await sock[token].sendMessage(
        number,
        {
          text: text,
        },
        reply
      );

      console.log("sendText", sendingTextMessage);
      return sendingTextMessage;
    }
  } catch (error) {
    winstonLog({
      tag: "error",
      token: token,
      json: {
        tag: "error-sendText",
        message: "error send text",
        data: {
          token: token,
          error: error,
        },
      },
    });
    return false;
  }
}

// media
async function sendMedia(
  token,
  number,
  type,
  url,
  fileName,
  caption,
  replyToMessageId,
  participantId
) {
  /**
   * type is "url" or "local"
   * if you use local, you must upload into src/public/temp/[fileName]
   */

  try {
    if (type == "image") {
      var data = {
        image: url ? { url } : fs.readFileSync("src/public/temp/" + fileName),
        caption: caption ? caption : null,
      };
    } else if (type == "video") {
      var data = {
        video: url ? { url } : fs.readFileSync("src/public/temp/" + fileName),
        caption: caption ? caption : null,
      };
    } else if (type == "audio") {
      var data = {
        audio: url ? { url } : fs.readFileSync("src/public/temp/" + fileName),
        caption: caption ? caption : null,
      };
    } else if (type == "pdf") {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype: "application/pdf",
        fileName: fileName ? fileName : "file.pdf",
        caption: caption ? caption : null,
      };
    } else if (type == "xls") {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype: "application/excel",
        fileName: fileName ? fileName : null,
        caption: caption ? caption : null,
      };
    } else if (type == "xlsx") {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: fileName ? fileName : null,
        caption: caption ? caption : null,
      };
    } else if (type == "doc") {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype: "application/msword",
        fileName: fileName ? fileName : "file.doc",
        caption: caption ? caption : null,
      };
    } else if (type == "docx") {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName: fileName ? fileName : "file.docx",
        caption: caption ? caption : null,
      };
    } else if (type == "zip") {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype: "application/zip",
        fileName: fileName ? fileName : "file.zip",
        caption: caption ? caption : null,
      };
    } else if (type == "mp3" || type == "mpga") {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype: "audio/mpeg",
        fileName: fileName ? fileName : "file.mp3",
        caption: caption ? caption : null,
      };
      // mimetype mp3 sebelumnya : application/mp3
    } else {
      var data = {
        document: url
          ? { url }
          : fs.readFileSync("src/public/temp/" + fileName),
        mimetype: "application/octet-stream",
        fileName: fileName ? fileName : null,
        caption: caption ? caption : null,
      };
    }
    var reply = {};
    if (replyToMessageId) {
      if (number.includes("@g.us")) {
        reply = {
          quoted: {
            key: {
              id: replyToMessageId,
              remoteJid: number,
              participant: participantId,
            },
            message: { conversation: "" },
          },
        };
      } else {
        reply = {
          quoted: {
            key: { id: replyToMessageId, remoteJid: number },
            message: { conversation: "" },
          },
        };
      }
    }
    if (Array.isArray(number)) {
      for (let i = 0; i < number.length; i++) {
        const random = Math.floor(
          Math.random() * (process.env.MAX - process.env.MIN + 1) +
            process.env.MIN
        );
        const delay = i * 1000 * random;
        setTimeout(async () => {
          await sock[token].sendMessage(number[i], data);
        }, delay);
      }
      return `Sending ${number.length} message start`;
    } else {
      var sendMsg = await sock[token].sendMessage(number, data, reply);
      // console.log(sendMsg)
      return sendMsg;
    }
  } catch (error) {
    console.log(`sendMedia Error ${error?.message}`);
    return false;
  }
}

// button message
async function sendButtonMessage(
  token,
  number,
  button,
  message,
  footer,
  type,
  image
) {
  /**
   * type is "url" or "local"
   * if you use local, you must upload into src/public/temp/[fileName]
   */

  try {
    const buttons = button.map((x, i) => {
      return {
        buttonId: i,
        buttonText: { displayText: x.displayText },
        type: 1,
      };
    });
    if (image) {
      var buttonMessage = {
        image:
          type == "url"
            ? { url: image }
            : fs.readFileSync("src/public/temp/" + image),
        // jpegThumbnail: await lib.base64_encode(),
        caption: message,
        footer: footer,
        buttons: buttons,
        headerType: 4,
      };
    } else {
      var buttonMessage = {
        text: message,
        footer: footer,
        buttons: buttons,
        headerType: 1,
      };
    }
    if (Array.isArray(number)) {
      for (let i = 0; i < number.length; i++) {
        const random = Math.floor(
          Math.random() * (process.env.MAX - process.env.MIN + 1) +
            process.env.MIN
        );
        const delay = i * 1000 * random;
        setTimeout(async () => {
          await sock[token].sendMessage(number[i], buttonMessage);
        }, delay);
      }
      return `Sending ${number.length} message start`;
    } else {
      const sendMsg = await sock[token].sendMessage(number, buttonMessage);
      return sendMsg;
    }
  } catch (error) {
    console.log(`sendButtonMessage Error ${error?.message}`);
    return false;
  }
}

// template message
async function sendTemplateMessage(token, number, button, text, footer, image) {
  try {
    const templateButtons = [
      {
        index: 1,
        urlButton: { displayText: button[0].displayText, url: button[0].url },
      },
      {
        index: 2,
        callButton: {
          displayText: button[1].displayText,
          phoneNumber: button[1].phoneNumber,
        },
      },
      {
        index: 3,
        quickReplyButton: {
          displayText: button[2].displayText,
          id: button[2].id,
        },
      },
    ];

    if (image) {
      var buttonMessage = {
        caption: text,
        footer: footer,
        templateButtons: templateButtons,
        image: { url: image },
      };
    } else {
      var buttonMessage = {
        text: text,
        footer: footer,
        templateButtons: templateButtons,
      };
    }
    if (Array.isArray(number)) {
      for (let i = 0; i < number.length; i++) {
        const random = Math.floor(
          Math.random() * (process.env.MAX - process.env.MIN + 1) +
            process.env.MIN
        );
        const delay = i * 1000 * random;
        setTimeout(async () => {
          await sock[token].sendMessage(number[i], buttonMessage);
        }, delay);
      }
      return `Sending ${number.length} message start`;
    } else {
      const sendMsg = await sock[token].sendMessage(number, buttonMessage);
      return sendMsg;
    }
  } catch (error) {
    console.log(`sendTemplateMessage Error ${error?.message}`);
    return false;
  }
}

// list message
async function sendListMessage(
  token,
  number,
  list,
  text,
  footer,
  title,
  buttonText
) {
  try {
    const sections = list.map((x, i) => {
      return {
        title: x.title,
        rows: x.rows.map((xx, ii) => {
          return {
            title: xx.title,
            rowId: ii,
            description: xx.description ? xx.description : null,
          };
        }),
      };
    });
    const listMessage = { text, footer, title, buttonText, sections };
    if (Array.isArray(number)) {
      for (let i = 0; i < number.length; i++) {
        const random = Math.floor(
          Math.random() * (process.env.MAX - process.env.MIN + 1) +
            process.env.MIN
        );
        const delay = i * 1000 * random;
        setTimeout(async () => {
          await sock[token].sendMessage(number[i], listMessage);
        }, delay);
      }
      return `Sending ${number.length} message start`;
    } else {
      const sendMsg = await sock[token].sendMessage(number, listMessage);
      return sendMsg;
    }
  } catch (error) {
    console.log(`sendListMessage Error ${error?.message}`);
    return false;
  }
}

// reaction message
async function sendReaction(token, number, text, key) {
  try {
    const reactionMessage = {
      react: {
        text: text,
        key: key,
      },
    };
    const sendMsg = await sock[token].sendMessage(number, reactionMessage);
    return sendMsg;
  } catch (error) {
    console.log(`sendReaction Error ${error?.message}`);
    return false;
  }
}

// if exist
async function isExist(token, number) {
  try {
    const [result] = await sock[token].onWhatsApp(number);
    return result;
  } catch (error) {
    return false;
  }
}

// ppUrl
async function getPpUrl(token, number, highrest) {
  let ppUrl;
  try {
    if (highrest) {
      // for high res picture
      ppUrl = await sock[token].profilePictureUrl(number, "image");
    } else {
      // for low res picture
      ppUrl = await sock[token].profilePictureUrl(number);
    }

    return ppUrl;
  } catch (error) {
    console.log(`getPPUrl Error ${error?.message}`);
    return false;
  }
}

// delete for everyone
async function deleteEveryOne(token, number, key) {
  try {
    const deleteEveryOne = await sock[token].sendMessage(number, {
      delete: key,
    });
    return deleteEveryOne;
  } catch (error) {
    console.log(`deleteEveryOne Error ${error?.message}`);
    return false;
  }
}

// group metadata
async function groupMetadata(token, number) {
  try {
    const metadata = await sock[token].groupMetadata(number);
    return metadata;
  } catch (error) {
    console.log(`groupMetadata Error ${error?.message}`);
    return false;
  }
}

async function getAllGroups(token) {
  try {
    const allChats = sock[token].chats.all();
    
    // Filter to get only group chats
    const groups = allChats.filter(chat => chat.jid.endsWith('@g.us'));
    
    console.log('Groups:', groups);
    return groups;
  } catch (error) {
    console.error('Error fetching groups:', error);
  }
}

// close connection
async function deleteCredentials(token) {
  try {
    // await sock[token].logout();
    clearInterval(intervalStore[token]);
    clearInterval(intervalConnCheck[token]);
    delete sock[token];
    delete qrcode[token];
    delete counterQr[token];
    // fs.rmdir(`credentials/${token}`, { recursive: true }, (err) => {
    //   // if (err) {
    //   //     throw err;
    //   // }
    //   console.log(`credentials/${token} is deleted`);
    // });
    return {
      status: true,
      message: "Deleting session and credential",
    };
  } catch (error) {
    return {
      status: true,
      message: "Nothing deleted",
    };
  }
}

/** HELPER */
async function getChromeLates() {
  try {
    const req = await axios.get(
      "https://versionhistory.googleapis.com/v1/chrome/platforms/linux/channels/stable/versions"
    );
    return req;
  } catch (error) {
    console.error("Error fetching Chrome versions:", error);
    var data = {
      versions: [
        {
          version: "126.0.6478.126",
        },
      ],
    };
    return data;
  }
}

async function clearConnection(token) {
  try{
    await sock[token].logout();
  }catch(error){
    console.log(error)
  }
  delete sock[token];
  delete qrcode[token];
  delete counterQr[token];
  clearInterval(intervalStore[token]);
  clearInterval(intervalConnCheck[token]);
  fs.rmdir(`credentials/${token}`, { recursive: true }, (err) => {
    // if (err) {
    //   throw err;
    // }
    console.log(`clear connection credentials/${token} is deleted`);
    return true;
  });
  return true;
}

//ADICIONADO TESTES DOCUMENTO
async function getDocumentBase64(token, msg) {
  // download stream
  if (msg.message.documentMessage) {
    var stream = await downloadContentFromMessage(
      msg.message.documentMessage,
      "document"
    );
    var mimetype = msg.message.documentMessage.mimetype;
  }
  let buffer = Buffer.from([]);

  // awaiting stream
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  // convert binary data to base64 encoded string
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
  // return 'data:image/png;base64,'+buffer.toString('base64');
}
// ADICIONADO TESTES DOCUMENTO

//ADICIONADO TESTES AUDIO
async function getAudioBase64(token, msg) {
  // download stream
  if (msg.message.audioMessage) {
    var stream = await downloadContentFromMessage(
      msg.message.audioMessage,
      "audio"
    );
    var mimetype = msg.message.audioMessage.mimetype;
  }
  let buffer = Buffer.from([]);

  // awaiting stream
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  // convert binary data to base64 encoded string
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
  // return 'data:image/png;base64,'+buffer.toString('base64');
}
// ADICIONADO TESTES AUDIO

//ADICIONADO STICKERS
async function getStickerBase64(token, msg) {
  // download stream
  if (msg.message.stickerMessage) {
    var stream = await downloadContentFromMessage(
      msg.message.stickerMessage,
      "sticker"
    );
    var mimetype = msg.message.stickerMessage.mimetype;
  }
  let buffer = Buffer.from([]);

  // awaiting stream
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  // convert binary data to base64 encoded string
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
  // return 'data:image/png;base64,'+buffer.toString('base64');
}
// ADICIONADO STICKERS

//adicionando VIDEO BASE64

async function getVideoBase64(token, msg) {
  // download stream
  if (msg.message.videoMessage) {
    var stream = await downloadContentFromMessage(
      msg.message.videoMessage,
      "video"
    );
    var mimetype = msg.message.videoMessage.mimetype;
    //if ( msg.message.videoMessage.gifPlayback ) return false
  }

  let buffer = Buffer.from([]);

  // awaiting stream
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  // convert binary data to base64 encoded string
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
}

//FIM do video base64

async function getImageBase64(token, msg) {
  // download stream
  if (msg.message.imageMessage) {
    var stream = await downloadContentFromMessage(
      msg.message.imageMessage,
      "image"
    );
    var mimetype = msg.message.imageMessage.mimetype;
  }
  //else {
  //   var stream = await downloadContentFromMessage(msg.message.videoMessage, 'video')
  //   var mimetype = msg.message.videoMessage.mimetype
  //   if ( !msg.message.videoMessage.gifPlayback ) return false
  // }
  let buffer = Buffer.from([]);

  // awaiting stream
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  // convert binary data to base64 encoded string
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
  // return 'data:image/png;base64,'+buffer.toString('base64');
}

function winstonLog({ tag, token, json }) {
  winston.info(`${tag} - ${token} - ${JSON.stringify(json)}`);
}

function writeJsonToFile({ token, name, json }) {
  const path = `credentials/${token}/${name}.json`;
  const folderPath = `credentials/${token}`;
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  if (fs.existsSync(path)) {
    var arr = JSON.parse(fs.readFileSync(path));
    if (name === "messages" && arr?.messages && json?.messages) {
      if(arr.messages.length > 0){
        chachedMsg = [...chachedMsg, ...json.messages];
      }else{
        chachedMsg = [...arr.messages,...json.messages];
      }
      json = {
        messages: [...arr.messages, ...json.messages],
        isLatest: json.isLatest,
      };
    } else if (name === "chats") {
      json = {
        chats: [...arr.chats, ...json.chats],
        isLatest: json.isLatest,
      };
    } else if (name === "contacts") {
      json = {
        contacts: [...arr.contacts, ...json.contacts],
        isLatest: json.isLatest,
      };
    }
  }
  fs.writeFileSync(path, JSON.stringify(json));
}

function readJsonFromFile({ token, name }) {
  const path = `credentials/${token}/${name}.json`;
  if (fs.existsSync(path)) {
    return {
      name: name,
      json: JSON.parse(fs.readFileSync(path)),
    };
  }
  return {
    name: name,
    json: [],
  };
}

// async function manageIncomingMessage({ token, upsert, io }) {
//   upsert.isLatest = true;
//   writeJsonToFile({ token, name: "messages", json: upsert });
//   console.log("manageIncomingMessage",upsert);
//   if (!upsert?.messages) return;
//   for (const msg of upsert.messages) {
//     try {
//       const id = msg.key.remoteJid;
//       const pushName = msg.pushName;
//       const messageType = Object.keys(msg.message)[0] || null;
//       const text =
//         msg.message?.conversation ||
//         msg.message?.extendedTextMessage?.text ||
//         msg.message?.editedMessage?.message?.protocolMessage?.editedMessage
//           ?.conversation ||
//         msg.message?.imageMessage?.caption ||
//         undefined;
//       const contextInfo =
//         msg.message?.extendedTextMessage?.contextInfo || undefined;
//       const quotedMessage =
//         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
//         undefined;
//       const key = msg.key;
//       const message = msg.message;
//       console.log("isi pesan");
//       console.log(JSON.stringify(msg.message));
//       await sock[token].sendPresenceUpdate("unavailable", key.remoteJid);
//       io.emit("message-upsert", {
//         token,
//         id,
//         pushName,
//         messageType,
//         text,
//         key,
//         message,
//       });

//       var dataSend = {
//         token: token,
//         key: key,
//         message: message,
//         base64: process.env.BASE64,
//       };

//       const enviarViaBase64 = process.env.BASE64;
//       if (enviarViaBase64 === "true") {
//         // CHECA SE O BASE64 ESTÁ ATIVO "CHECK BASE64 ACTIVE"

//         if (msg?.message?.imageMessage) {
//           dataSend.imageBase64 = await getImageBase64(token, msg);
//         }

//         if (msg?.message?.stickerMessage) {
//           dataSend.stickerBase64 = await getStickerBase64(token, msg);
//         }

//         if (msg?.message?.audioMessage) {
//           dataSend.audioBase64 = await getAudioBase64(token, msg);
//         }

//         if (msg?.message?.documentMessage) {
//           dataSend.documentBase64 = await getDocumentBase64(token, msg);
//         }

//         if (msg?.message?.videoMessage) {
//           dataSend.videoBase64 = await getVideoBase64(token, msg);
//         }
//       }

//       console.log(`\n\n-----WEBHOOK LOG-----`);
//       console.log({
//         dataSend,
//       });

//       /** START WEBHOOK */
//       const url = process.env.WEBHOOK;
//       if (url) {
//         console.log(`Send Data To ${url}`);
//         axios
//           .post(url, dataSend)
//           .then(function (response) {
//             if (process.env.NODE_ENV === "development") {
//               // console.log(`\n> RESPONSE FROM WEBHOOK`);
//               // console.log(response.data);
//             }
//           })
//           .catch(function (error) {
//             // console.log(error);
//           });
//       } else {
//         console.log(`-----Webhook Not Set-----\n\n`);
//       }
//       console.log(`-----WEBHOOK LOG-----\n\n`);
//       /** END WEBHOOK */
//     } catch (error) {
//       // console.log(`manageIncomingMessage Error ${error?.message}`);
//       winstonLog({
//         tag: "webhook",
//         token: token,
//         json: {
//           tag: "manageIncomingMessage",
//           message: "Error manage incoming message",
//           data: {
//             token: token,
//             upsert: upsert,
//           },
//         },
//       });
//     }
//   }
// }

async function manageIncomingMessage({ token, upsert, io }) {
  upsert.isLatest = true;
  writeJsonToFile({ token, name: "messages", json: upsert });
  if (!upsert?.messages) return;
  for (const msg of upsert.messages) {
    try {
      const id = msg.key.remoteJid;
      const pushName = msg.pushName;
      const messageType = Object.keys(msg.message)[0] || null;
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        undefined;
      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo || undefined;
      const quotedMessage =
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
        undefined;
      const key = msg.key;
      const message = msg.message;

      await sock[token].sendPresenceUpdate("unavailable", key.remoteJid);
      io.emit("message-upsert", {
        token,
        id,
        pushName,
        messageType,
        text,
        key,
        message,
      });

      var dataSend = {
        token: token,
        key: key,
        message: message,
        base64: process.env.BASE64,
      };

      const enviarViaBase64 = process.env.BASE64;
      if (enviarViaBase64 === "true") {
        // CHECA SE O BASE64 ESTÁ ATIVO "CHECK BASE64 ACTIVE"

        if (msg?.message?.imageMessage) {
          dataSend.imageBase64 = await getImageBase64(token, msg);
        }

        if (msg?.message?.stickerMessage) {
          dataSend.stickerBase64 = await getStickerBase64(token, msg);
        }

        if (msg?.message?.audioMessage) {
          dataSend.audioBase64 = await getAudioBase64(token, msg);
        }

        if (msg?.message?.documentMessage) {
          dataSend.documentBase64 = await getDocumentBase64(token, msg);
        }

        if (msg?.message?.videoMessage) {
          dataSend.videoBase64 = await getVideoBase64(token, msg);
        }
      }

      console.log(`\n\n-----WEBHOOK LOG-----`);
      console.log({
        dataSend,
      });

      /** START WEBHOOK */
      const url = process.env.WEBHOOK;
      if (url) {
        console.log(`Send Data To ${url}`);
        axios
          .post(url, dataSend)
          .then(function (response) {
            if (process.env.NODE_ENV === "development") {
              console.log(`\n> RESPONSE FROM WEBHOOK`);
              console.log(response.data);
            }
          })
          .catch(function (error) {
            console.log(error);
          });
      } else {
        console.log(`-----Webhook Not Set-----\n\n`);
      }
      console.log(`-----WEBHOOK LOG-----\n\n`);
      /** END WEBHOOK */
    } catch (error) {
      console.log(error);
      winstonLog({
        tag: "webhook",
        token: token,
        json: {
          tag: "manageIncomingMessage",
          message: "Error manage incoming message",
          data: {
            token: token,
            upsert: upsert,
          },
        },
      });
    }
  }
}

module.exports = {
  connectToWhatsApp,
  sendText,
  sendMedia,
  sendButtonMessage,
  sendTemplateMessage,
  sendListMessage,
  sendReaction,
  isExist,
  getPpUrl,
  deleteEveryOne,
  groupMetadata,
  deleteCredentials,
};
