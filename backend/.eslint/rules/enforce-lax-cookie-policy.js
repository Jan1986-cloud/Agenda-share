// backend/.eslint/rules/enforce-lax-cookie-policy.js
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce SameSite=lax for session cookies in production',
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: 'code',
    schema: [], // no options
  },
  create: function (context) {
    return {
      Property(node) {
        // Zoek naar de 'cookie' property binnen de 'session' configuratie
        if (
          node.key.name === 'cookie' &&
          node.parent.type === 'ObjectExpression' &&
          node.parent.parent.callee &&
          node.parent.parent.callee.name === 'session'
        ) {
          const sameSiteProperty = node.value.properties.find(
            (p) => p.key.name === 'sameSite'
          );

          if (sameSiteProperty) {
            if (
              sameSiteProperty.value.type !== 'Literal' ||
              sameSiteProperty.value.value !== 'lax'
            ) {
              context.report({
                node: sameSiteProperty.value,
                message: 'Session cookie sameSite policy must be "lax".',
                fix(fixer) {
                  return fixer.replaceText(sameSiteProperty.value, "'lax'");
                }
              });
            }
          }
        }
      },
    };
  },
};