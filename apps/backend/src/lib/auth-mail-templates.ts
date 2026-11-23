import type { SupportedLocale } from '@gekichumai/api-contract'

/**
 * The account emails (gekichumai/meta#80) in every language DXRating is translated into: a link to verify an address,
 * and a link to choose a new password. Each is plain text plus a simple HTML version that says the same thing, with no
 * remote images, scripts or tracking. The language is the visitor's (`detectAuthLocale`), English when unknown.
 */

export type AuthMailKind = 'verify_email' | 'reset_password'

interface MessageCopy {
  readonly subject: string
  readonly intro: (email: string) => string
  readonly action: string
  readonly expiry: (hours: number) => string
  readonly ignore: string
}

interface LocaleCopy {
  readonly verify_email: MessageCopy
  readonly reset_password: MessageCopy
  /** Above the bare link, for clients that can't open the button */
  readonly linkFallback: string
}

const enHours = (hours: number) => (hours === 1 ? '1 hour' : `${hours} hours`)

const COPY = {
  en: {
    verify_email: {
      subject: 'Confirm your email address for DXRating',
      intro: (email) => `Confirm that ${email} is the email address of your DXRating account.`,
      action: 'Confirm email address',
      expiry: (hours) => `The link works for ${enHours(hours)}.`,
      ignore: "If you didn't create a DXRating account, you can ignore this email.",
    },
    reset_password: {
      subject: 'Reset your DXRating password',
      intro: (email) => `We received a request to reset the password of the DXRating account for ${email}.`,
      action: 'Choose a new password',
      expiry: (hours) => `The link works for ${enHours(hours)}.`,
      ignore: "If you didn't ask for this, ignore this email. Your password stays the same.",
    },
    linkFallback: "If the button doesn't work, copy this link into your browser:",
  },
  ja: {
    verify_email: {
      subject: 'DXRating のメールアドレスを確認してください',
      intro: (email) => `${email} が DXRating アカウントのメールアドレスであることを確認してください。`,
      action: 'メールアドレスを確認',
      expiry: (hours) => `このリンクの有効期限は ${hours} 時間です。`,
      ignore: 'DXRating のアカウントを作成した覚えがない場合は、このメールを無視してください。',
    },
    reset_password: {
      subject: 'DXRating のパスワード再設定',
      intro: (email) => `${email} の DXRating アカウントについて、パスワード再設定のリクエストを受け付けました。`,
      action: '新しいパスワードを設定',
      expiry: (hours) => `このリンクの有効期限は ${hours} 時間です。`,
      ignore: '心当たりがない場合は、このメールを無視してください。パスワードは変更されません。',
    },
    linkFallback: 'ボタンが使えない場合は、次のリンクをブラウザに貼り付けてください：',
  },
  ko: {
    verify_email: {
      subject: 'DXRating 이메일 주소를 확인해 주세요',
      intro: (email) => `${email}이(가) DXRating 계정의 이메일 주소인지 확인해 주세요.`,
      action: '이메일 주소 확인',
      expiry: (hours) => `이 링크는 ${hours}시간 동안 유효합니다.`,
      ignore: 'DXRating 계정을 만든 적이 없다면 이 메일을 무시하세요.',
    },
    reset_password: {
      subject: 'DXRating 비밀번호 재설정',
      intro: (email) => `${email}의 DXRating 계정에 대한 비밀번호 재설정 요청을 받았습니다.`,
      action: '새 비밀번호 설정',
      expiry: (hours) => `이 링크는 ${hours}시간 동안 유효합니다.`,
      ignore: '요청한 적이 없다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않습니다.',
    },
    linkFallback: '버튼이 작동하지 않으면 아래 링크를 브라우저에 붙여 넣으세요:',
  },
  'zh-Hans': {
    verify_email: {
      subject: '请验证你的 DXRating 邮箱地址',
      intro: (email) => `请确认 ${email} 是你的 DXRating 账户邮箱。`,
      action: '验证邮箱地址',
      expiry: (hours) => `此链接在 ${hours} 小时内有效。`,
      ignore: '如果你没有注册过 DXRating 账户，请忽略此邮件。',
    },
    reset_password: {
      subject: '重置你的 DXRating 密码',
      intro: (email) => `我们收到了为 ${email} 的 DXRating 账户重置密码的请求。`,
      action: '设置新密码',
      expiry: (hours) => `此链接在 ${hours} 小时内有效。`,
      ignore: '如果这不是你本人的操作，请忽略此邮件，你的密码不会改变。',
    },
    linkFallback: '如果按钮无法使用，请将以下链接复制到浏览器中打开：',
  },
  'zh-Hant': {
    verify_email: {
      subject: '請驗證你的 DXRating 電子信箱',
      intro: (email) => `請確認 ${email} 是你的 DXRating 帳戶電子信箱。`,
      action: '驗證電子信箱',
      expiry: (hours) => `此連結在 ${hours} 小時內有效。`,
      ignore: '如果你沒有註冊過 DXRating 帳戶，請忽略此郵件。',
    },
    reset_password: {
      subject: '重設你的 DXRating 密碼',
      intro: (email) => `我們收到了為 ${email} 的 DXRating 帳戶重設密碼的請求。`,
      action: '設定新密碼',
      expiry: (hours) => `此連結在 ${hours} 小時內有效。`,
      ignore: '如果這不是你本人的操作，請忽略此郵件，你的密碼不會改變。',
    },
    linkFallback: '如果按鈕無法使用，請將以下連結複製到瀏覽器中開啟：',
  },
  ms: {
    verify_email: {
      subject: 'Sahkan alamat e-mel DXRating anda',
      intro: (email) => `Sahkan bahawa ${email} ialah alamat e-mel akaun DXRating anda.`,
      action: 'Sahkan alamat e-mel',
      expiry: (hours) => `Pautan ini sah selama ${hours} jam.`,
      ignore: 'Jika anda tidak membuat akaun DXRating, abaikan e-mel ini.',
    },
    reset_password: {
      subject: 'Tetapkan semula kata laluan DXRating anda',
      intro: (email) => `Kami menerima permintaan untuk menetapkan semula kata laluan akaun DXRating bagi ${email}.`,
      action: 'Pilih kata laluan baharu',
      expiry: (hours) => `Pautan ini sah selama ${hours} jam.`,
      ignore: 'Jika anda tidak membuat permintaan ini, abaikan e-mel ini. Kata laluan anda tidak akan berubah.',
    },
    linkFallback: 'Jika butang tidak berfungsi, salin pautan ini ke pelayar anda:',
  },
  id: {
    verify_email: {
      subject: 'Verifikasi alamat email DXRating-mu',
      intro: (email) => `Konfirmasi bahwa ${email} adalah alamat email akun DXRating-mu.`,
      action: 'Verifikasi alamat email',
      expiry: (hours) => `Tautan ini berlaku selama ${hours} jam.`,
      ignore: 'Jika kamu tidak membuat akun DXRating, abaikan email ini.',
    },
    reset_password: {
      subject: 'Atur ulang kata sandi DXRating-mu',
      intro: (email) => `Kami menerima permintaan untuk mengatur ulang kata sandi akun DXRating untuk ${email}.`,
      action: 'Buat kata sandi baru',
      expiry: (hours) => `Tautan ini berlaku selama ${hours} jam.`,
      ignore: 'Jika ini bukan kamu, abaikan email ini. Kata sandimu tidak akan berubah.',
    },
    linkFallback: 'Jika tombol tidak berfungsi, salin tautan ini ke browser-mu:',
  },
  fil: {
    verify_email: {
      subject: 'I-verify ang iyong email address sa DXRating',
      intro: (email) => `Kumpirmahin na ang ${email} ang email address ng iyong DXRating account.`,
      action: 'I-verify ang email address',
      expiry: (hours) => `Gumagana ang link na ito sa loob ng ${hours} oras.`,
      ignore: 'Kung hindi ka gumawa ng DXRating account, huwag pansinin ang email na ito.',
    },
    reset_password: {
      subject: 'I-reset ang iyong password sa DXRating',
      intro: (email) => `Nakatanggap kami ng request na i-reset ang password ng DXRating account para sa ${email}.`,
      action: 'Pumili ng bagong password',
      expiry: (hours) => `Gumagana ang link na ito sa loob ng ${hours} oras.`,
      ignore: 'Kung hindi ikaw ito, huwag pansinin ang email na ito. Hindi magbabago ang iyong password.',
    },
    linkFallback: 'Kung hindi gumagana ang button, kopyahin ang link na ito sa iyong browser:',
  },
  vi: {
    verify_email: {
      subject: 'Xác minh địa chỉ email DXRating của bạn',
      intro: (email) => `Hãy xác nhận ${email} là địa chỉ email của tài khoản DXRating của bạn.`,
      action: 'Xác minh địa chỉ email',
      expiry: (hours) => `Liên kết này có hiệu lực trong ${hours} giờ.`,
      ignore: 'Nếu bạn chưa từng tạo tài khoản DXRating, hãy bỏ qua email này.',
    },
    reset_password: {
      subject: 'Đặt lại mật khẩu DXRating của bạn',
      intro: (email) => `Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản DXRating của ${email}.`,
      action: 'Đặt mật khẩu mới',
      expiry: (hours) => `Liên kết này có hiệu lực trong ${hours} giờ.`,
      ignore: 'Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.',
    },
    linkFallback: 'Nếu nút không hoạt động, hãy sao chép liên kết này vào trình duyệt:',
  },
  th: {
    verify_email: {
      subject: 'ยืนยันที่อยู่อีเมลสำหรับ DXRating',
      intro: (email) => `ยืนยันว่า ${email} เป็นที่อยู่อีเมลของบัญชี DXRating ของคุณ`,
      action: 'ยืนยันที่อยู่อีเมล',
      expiry: (hours) => `ลิงก์นี้ใช้ได้ ${hours} ชั่วโมง`,
      ignore: 'หากคุณไม่ได้สร้างบัญชี DXRating โปรดเพิกเฉยต่ออีเมลนี้',
    },
    reset_password: {
      subject: 'รีเซ็ตรหัสผ่าน DXRating ของคุณ',
      intro: (email) => `เราได้รับคำขอให้รีเซ็ตรหัสผ่านของบัญชี DXRating สำหรับ ${email}`,
      action: 'ตั้งรหัสผ่านใหม่',
      expiry: (hours) => `ลิงก์นี้ใช้ได้ ${hours} ชั่วโมง`,
      ignore: 'หากคุณไม่ได้ส่งคำขอนี้ โปรดเพิกเฉยต่ออีเมลนี้ รหัสผ่านของคุณจะไม่เปลี่ยนแปลง',
    },
    linkFallback: 'หากปุ่มใช้ไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:',
  },
  my: {
    verify_email: {
      subject: 'DXRating အတွက် သင့် email လိပ်စာကို အတည်ပြုပါ',
      intro: (email) => `${email} သည် သင့် DXRating အကောင့်၏ email လိပ်စာ ဖြစ်ကြောင်း အတည်ပြုပါ။`,
      action: 'Email လိပ်စာ အတည်ပြုရန်',
      expiry: (hours) => `ဤလင့်ခ်ကို ${hours} နာရီအတွင်း အသုံးပြုနိုင်ပါသည်။`,
      ignore: 'DXRating အကောင့် မဖန်တီးခဲ့ပါက ဤ email ကို လျစ်လျူရှုပါ။',
    },
    reset_password: {
      subject: 'သင့် DXRating စကားဝှက်ကို ပြန်လည်သတ်မှတ်ပါ',
      intro: (email) => `${email} အတွက် DXRating အကောင့်၏ စကားဝှက်ကို ပြန်လည်သတ်မှတ်ရန် တောင်းဆိုမှုကို လက်ခံရရှိပါသည်။`,
      action: 'စကားဝှက်အသစ် သတ်မှတ်ရန်',
      expiry: (hours) => `ဤလင့်ခ်ကို ${hours} နာရီအတွင်း အသုံးပြုနိုင်ပါသည်။`,
      ignore: 'သင် မတောင်းဆိုခဲ့ပါက ဤ email ကို လျစ်လျူရှုပါ။ သင့်စကားဝှက် ပြောင်းလဲမည် မဟုတ်ပါ။',
    },
    linkFallback: 'ခလုတ် အလုပ်မလုပ်ပါက ဤလင့်ခ်ကို browser တွင် ကူးထည့်ပါ-',
  },
} satisfies Record<SupportedLocale, LocaleCopy>

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!)

export interface RenderedMail {
  readonly subject: string
  readonly text: string
  readonly html: string
}

/** One account email: what it says (`kind`), in `locale`, for the account's `email`, with its `url` */
export const renderAuthMail = ({
  kind,
  locale,
  email,
  url,
  expiresInHours,
}: {
  kind: AuthMailKind
  locale: SupportedLocale
  email: string
  url: string
  expiresInHours: number
}): RenderedMail => {
  const copy = COPY[locale] ?? COPY.en
  const message = copy[kind]
  const intro = message.intro(email)
  const expiry = message.expiry(expiresInHours)

  const text = [intro, '', `${message.action}:`, url, '', expiry, message.ignore, '', '— DXRating', ''].join('\n')

  const paragraph = (content: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${content}</p>`
  const href = escapeHtml(url)
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(message.subject)}</title>
</head>
<body style="margin:0;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1f2328">
<div style="max-width:480px;margin:0 auto">
<p style="margin:0 0 24px;font-size:18px;font-weight:600">DXRating</p>
${paragraph(escapeHtml(intro))}
<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;padding:10px 18px;border:1px solid #6d28d9;border-radius:6px;color:#6d28d9;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(message.action)}</a></p>
${paragraph(escapeHtml(expiry))}
${paragraph(escapeHtml(message.ignore))}
<p style="margin:24px 0 8px;font-size:13px;line-height:1.5;color:#59636e">${escapeHtml(copy.linkFallback)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all"><a href="${href}" style="color:#6d28d9">${href}</a></p>
</div>
</body>
</html>
`

  return { subject: message.subject, text, html }
}