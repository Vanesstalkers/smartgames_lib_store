async (channelName, actionName, actionData) => {
  const { pubClient } = lib.store.broadcaster;
  const result = await pubClient.publish(
    channelName,
    JSON.stringify({
      processType: 'action',
      actionName,
      actionData,
    })
  );
  return result ? true : false;
};
