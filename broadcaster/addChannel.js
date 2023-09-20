({ name: channelName, instance }) => {
  const { subClient, channels } = lib.store.broadcaster;
  if (!channels.has(channelName)) channels.set(channelName, { instance: null, subscribers: new Map() });
  const channel = channels.get(channelName);

  channel.instance = instance;
  subClient.subscribe(channelName, (err, count) => {
    if (err) throw err;
  });
  return channel;
};
