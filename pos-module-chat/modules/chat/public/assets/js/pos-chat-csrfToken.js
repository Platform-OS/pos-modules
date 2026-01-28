const csrfToken = () => {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) { throw new Error('Unable to find CSRF token meta'); }

  const token = meta.getAttribute('content');
  if (!token) { throw new Error('Unable to get CSRF token value'); }

  return token;
};

export default csrfToken;
