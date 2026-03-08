# useAuth Hook

A reusable authentication hook that provides a simple way to manage authentication state and ensure users are authenticated before performing actions.

## Features

- **Session Management**: Access current user session and authentication state
- **Login Dialog**: Automatically display a login dialog when authentication is required
- **ensureAuthenticated**: Programmatically check if a user is authenticated before performing actions
- **Reusable**: Use across components without duplicating authentication logic

## Usage

### Basic Example

```tsx
import { useAuth } from '../../hooks/useAuth'

const MyComponent = () => {
  const { session, isAuthenticated, ensureAuthenticated, LoginDialog } = useAuth()

  const handleProtectedAction = async () => {
    // This will show login dialog if not authenticated
    const isAuth = await ensureAuthenticated()
    if (!isAuth) return

    // Proceed with authenticated action
    await performAction()
  }

  return (
    <div>
      <LoginDialog />
      <button onClick={handleProtectedAction}>Protected Action</button>
      {isAuthenticated && <p>Welcome, {session.user.name}!</p>}
    </div>
  )
}
```

### With throwOnError

```tsx
const handleAction = async () => {
  try {
    // This will throw an error if not authenticated
    await ensureAuthenticated({ throwOnError: true })
    await performAction()
  } catch (error) {
    console.error('Authentication required:', error)
  }
}
```

## API

### Return Values

- `session`: The current Better Auth session object (or `undefined` if not authenticated)
- `user`: The current user object (shorthand for `session?.user`)
- `isAuthenticated`: Boolean indicating if user is authenticated
- `ensureAuthenticated(options)`: Async function that checks authentication
  - `options.throwOnError` (default: `false`): If true, throws error instead of showing dialog
  - Returns: `Promise<boolean>` - true if authenticated, false otherwise
- `openLoginDialog()`: Manually open the login dialog
- `closeLoginDialog()`: Manually close the login dialog
- `LoginDialog`: Component to render the login dialog

## Examples

### Comment Form (as implemented in SheetComments)

```tsx
const SheetComments = ({ sheet }) => {
  const { session, ensureAuthenticated, LoginDialog } = useAuth()
  const [content, setContent] = useState('')

  const handleSubmit = async () => {
    const isAuthenticated = await ensureAuthenticated()
    if (!isAuthenticated) return

    await client.comments.create({ content, ...sheet })
  }

  return (
    <div>
      <LoginDialog />
      <TextField value={content} onChange={(e) => setContent(e.target.value)} disabled={!session} />
      <Button onClick={handleSubmit}>Submit</Button>
    </div>
  )
}
```

### Manual Dialog Control

```tsx
const MyComponent = () => {
  const { openLoginDialog, closeLoginDialog, LoginDialog } = useAuth()

  return (
    <div>
      <LoginDialog />
      <button onClick={openLoginDialog}>Sign In</button>
    </div>
  )
}
```