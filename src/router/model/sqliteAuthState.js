const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const {
    Curve,
    signedKeyPair,
    proto,
    generateRegistrationId,
} = require('baileys');

const { randomBytes } = require('crypto');

const initAuthCreds = () => {
    const identityKey = Curve.generateKeyPair();
    return {
        noiseKey: Curve.generateKeyPair(),
        signedIdentityKey: identityKey,
        signedPreKey: signedKeyPair(identityKey, 1),
        registrationId: generateRegistrationId(),
        advSecretKey: randomBytes(32).toString('base64'),
        processedHistoryMessages: [],
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSettings: {
            unarchiveChats: false,
        },
    };
};

const BufferJSON = {
    replacer: (k, value) => {
        if (
            Buffer.isBuffer(value) ||
            value instanceof Uint8Array ||
            value?.type === 'Buffer'
        ) {
            return {
                type: 'Buffer',
                data: Buffer.from(value?.data || value).toString('base64'),
            };
        }
        return value;
    },

    reviver: (_, value) => {
        if (
            typeof value === 'object' &&
            !!value &&
            (value.buffer === true || value.type === 'Buffer')
        ) {
            const val = value.data || value.value;
            return typeof val === 'string'
                ? Buffer.from(val, 'base64')
                : Buffer.from(val || []);
        }
        return value;
    },
};

const useSQLiteAuthState = async (dbPath, id) => {
    
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, ''); // Ensure database file is created
    }
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS auth (
            id TEXT PRIMARY KEY,
            data TEXT
        )
    `);

    const writeData = async (key, data) => {
        const jsonData = JSON.stringify(data, BufferJSON.replacer);
        await db.run(
            `INSERT INTO auth (id, data) VALUES (?, ?) 
            ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
            key, jsonData
        );
    };

    const readData = async (key) => {
        const row = await db.get(`SELECT data FROM auth WHERE id = ?`, key);
        return row ? JSON.parse(row.data, BufferJSON.reviver) : null;
    };

    const removeData = async (key) => {
        await db.run(`DELETE FROM auth WHERE id = ?`, key);
    };

    const creds = await readData(`${id}-creds.json`) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (key) => {
                        let value = await readData(`${id}-${type}-${key}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[key] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const key in data[category]) {
                            const value = data[category][key];
                            const dbKey = `${id}-${category}-${key}`;
                            tasks.push(value ? writeData(dbKey, value) : removeData(dbKey));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(`${id}-creds.json`, creds),
        close: () => db.close()
    };
};

module.exports = { useSQLiteAuthState };
