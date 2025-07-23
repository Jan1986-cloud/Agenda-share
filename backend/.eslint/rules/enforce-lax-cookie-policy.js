// backend/.eslint/rules/enforce-lax-cookie-policy.js
export default {
  meta: {
    type: 'problem',
    docs: {
      description: "Enforce SameSite='lax' for session cookies",
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: null,
    schema: [],
  },
  create: function (context) {
    return {
      Property(node) {
        if (
          node.key.name === 'cookie' &&
          node.parent.type === 'ObjectExpression' &&
          node.parent.parent.callee &&
          node.parent.parent.callee.name === 'session'
        ) {
          const cookieObject = node.value;

          // Check for sameSite: 'lax'
          const sameSiteProp = cookieObject.properties.find(p => p.key.name === 'sameSite');
          if (
            !sameSiteProp ||
            sameSiteProp.value.type !== 'Literal' ||
            sameSiteProp.value.value !== 'lax'
          ) {
            context.report({
              node: sameSiteProp ? sameSiteProp.value : node,
              message: "Session cookie `sameSite` property must be 'lax'.",
            });
          }
        }
      },
    };
  },
};