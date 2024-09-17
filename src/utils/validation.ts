export const json = (props: object, required: string[] = []) => {
  return {
    schema: {
      body: {
        type: "object",
        properties: props,
        required,
      },
    },
  };
};
