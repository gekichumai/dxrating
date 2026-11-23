import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'
import plugin from '../index'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
const remounts = (name: string, host: string) => ({
  message: new RegExp(`^${name} is a component defined inside ${host}, .* Define ${name} at module scope`),
})

tester.run('no-nested-component', plugin.rules['no-nested-component'], {
  valid: [
    'export const LoginDialog = ({ open }: { open: boolean }) => <Dialog open={open} />',
    `export const useAuth = () => {
      const [open, setOpen] = useState(false)
      return { loginDialog: <LoginDialog open={open} onClose={() => setOpen(false)} /> }
    }`,
    `export function List({ items }: { items: string[] }) {
      const renderRow = (item: string) => <li key={item}>{item}</li>
      return <ul>{items.map(renderRow)}</ul>
    }`,
    `export const useParser = () => {
      const Parse = (value: string) => Number(value)
      return Parse
    }`,
    `describe('useAuth', () => {
      const Host = () => <div />
      it('renders', () => render(<Host />))
    })`,
  ],
  invalid: [
    {
      name: '#625: useAuth returned a LoginDialog component it created on every render',
      code: `export const useAuth = () => {
        const [open, setOpen] = useState(false)
        const LoginDialog = () => <Dialog open={open} onClose={() => setOpen(false)} />
        return { LoginDialog }
      }`,
      errors: [remounts('LoginDialog', 'useAuth')],
    },
    {
      name: 'a component created in a state initializer is still defined inside the hook',
      code: `export const useAuth = () => {
        const [LoginDialog] = useState(() => function LoginDialog() { return <Dialog /> })
        return { LoginDialog }
      }`,
      errors: [remounts('LoginDialog', 'useAuth')],
    },
    {
      name: 'a component defined inside a component',
      code: `export function Page({ rows }: { rows: string[] }) {
        function Row({ row }: { row: string }) { return <li>{row}</li> }
        return <ul>{rows.map((row) => <Row key={row} row={row} />)}</ul>
      }`,
      errors: [remounts('Row', 'Page')],
    },
  ],
})