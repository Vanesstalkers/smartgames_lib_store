async () => {
  lib.store = Object.assign(
    (col) => {
      if (!lib.store[col]) lib.store[col] = new Map();
      return lib.store[col];
    },
    lib.store,
    {
      // customData
    }
  );

  const broadcaster = lib.store.broadcaster;
  broadcaster.channels = new Map();

  broadcaster.pubClient = new npm.ioredis({ host: 'localhost', port: '6379' });
  broadcaster.subClient = new npm.ioredis({ host: 'localhost', port: '6379' });

  broadcaster.subClient.subscribe('updateData', (err, count) => {
    if (err) throw err;
  });
  broadcaster.subClient.on('message', async (channelName, message) => {
    try {
      const messageData = JSON.parse(message);
      const { processType, ...processData } = messageData;
      const channel = lib.store.broadcaster.channels.get(channelName);
      
      if (!channel.instance) throw new Error('Instance not found');
      switch (processType) {
        case 'data':
          channel.instance.processData(processData.data);
          break;
        case 'action':
          channel.instance.processAction(processData);
          break;
      }
    } catch (err) {
      console.log({ channelName, message }, err);
    }
  });
};
