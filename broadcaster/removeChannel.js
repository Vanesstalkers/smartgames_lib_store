({ name: channelName }) => {
  const { subClient, channels } = lib.store.broadcaster;
  channels.delete(channelName);
  subClient.unsubscribe(channelName, (err, count) => {
    if (err) throw err;
  });
};
