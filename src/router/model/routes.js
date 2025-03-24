'use strict'

const lib = require('../../lib')

const createInstance = async (req, res) => {
    const { token } = req.body
    if ( token ) {
        try {
            log.info(`Reconnectingsession1 ${token}`);
            const connect = await req.wa.connectToWhatsApp(token, req.io)
            const status = connect?.status
            const message = connect?.message
            return res.send({
                status: status,
                qrcode: connect?.qrcode,
                message: message ? message : 'Processing'
            })
        } catch (error) {
            console.log(error)
            return res.send({status: false, error: error})
        }
    }
    res.status(403).end('Token needed')

}

const sendText = async (req, res) => {

    const { token, number, text,replyToMessageId,participantId } = req.body

    if ( token && number && text ) {
        const sendingTextMessage = await req.wa.sendText(token, number, text,replyToMessageId,participantId)
        if (sendingTextMessage) {
            return res.send({status: true, data: sendingTextMessage})
        }
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const sendMedia = async (req, res) => {

    const { token, number, type, url, fileName, caption,replyToMessageId,participantId } = req.body

    if ( token && number && type && url ) {
        const sendingMediaMessage = await req.wa.sendMedia(token, number, type, url, fileName, caption,replyToMessageId,participantId)
        if (sendingMediaMessage) return res.send({status: true, data: sendingMediaMessage})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const sendButtonMessage = async (req, res) => {
    
    const { token, number, button, message, footer, type, image } = req.body
    
    if ( token && number && button && message && footer ) {
        const sendButtonMessage = await req.wa.sendButtonMessage(token, number, button, message, footer, type, image)
        if (sendButtonMessage) return res.send({status: true, data: sendButtonMessage})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const sendTemplateMessage = async (req, res) => {

    const { token, number, button, text, footer, image } = req.body

    if ( token && number && button && text && footer ) {
        const sendTemplateMessage = await req.wa.sendTemplateMessage( token, number, button, text, footer, image )
        if (sendTemplateMessage) return res.send({status: true, data: sendTemplateMessage})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const sendListMessage = async (req, res) => {
    
    const { token, number, list, text, footer, title, buttonText } = req.body

    if ( token && number && list && text && footer && title && buttonText ) {
        const sendListMessage = await req.wa.sendListMessage(token, number, list, text, footer, title, buttonText)
        if ( sendListMessage ) return res.send({status: true, data: sendListMessage})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const sendReaction = async (req, res) => {
    
    const { token, number, text, key } = req.body

    if ( token && number && text && key ) {
        const sendReaction = await req.wa.sendReaction(token, number, text, key)
        if ( sendReaction ) return res.send({status: true, data: sendReaction})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const isExists = async (req, res) => {
    
    const { token, number } = req.body
    
    if ( token && number ) {
        const isExists = await req.wa.isExist(token, number)
        if (isExists) return res.send({status: true, data: isExists})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const getPpUrl = async (req, res) => {
    
    const { token, number, highrest } = req.body

    if ( token && number && highrest ) {
        const getPpUrl = await req.wa.getPpUrl(token, number, highrest)
        if ( getPpUrl ) return res.send({status: true, data: getPpUrl})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const deleteEveryOne = async (req, res) => {
    
    const { token, number, key } = req.body

    if ( token && number && key ) {
        const deleteEveryOne = await req.wa.deleteEveryOne(token, number, key)
        if ( deleteEveryOne ) return res.send({status: true, data: deleteEveryOne})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const groupMetadata = async (req, res) => {
    const { token, number } = req.body

    if (token && number) {
        const groupMetadata = await req.wa.groupMetadata(token, number)
        if ( groupMetadata ) return res.send({status: true, data: groupMetadata})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

const deleteCredentials = async (req, res) => {
    const { token } = req.body

    if (token) {
        const deleteCredentials = await req.wa.deleteCredentials(token)
        if ( deleteCredentials ) return res.send({status: true, data: deleteCredentials})
        return res.send({status: false, message: 'Check your connection'})
    }
    res.send({status: false, message: 'Check your parameter'})

}

module.exports = {
    createInstance,
    sendText,
    sendMedia,
    sendButtonMessage,
    sendTemplateMessage,
    sendListMessage,
    sendReaction,
    isExists,
    getPpUrl,
    deleteEveryOne,
    groupMetadata,
    deleteCredentials

}
