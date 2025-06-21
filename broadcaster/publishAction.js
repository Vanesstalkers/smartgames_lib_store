(async function publishAction(channelName, actionName, actionData) {
  const { pubClient } = lib.store.broadcaster;
  const result = await pubClient.publish(
    channelName,
    JSON.stringify({
      broadcaster: this.channelName?.(),
      processType: 'action',
      actionName,
      actionData,
    })
  );
  return result ? true : false;
})
