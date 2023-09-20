(channelName, actionName, actionData) => {
  const { pubClient } = lib.store.broadcaster;
  pubClient.publish(
    channelName,
    JSON.stringify({
      processType: 'action',
      actionName,
      actionData,
    })
  );
};
