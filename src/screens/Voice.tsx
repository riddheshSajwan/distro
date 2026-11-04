import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { usePage, usePageContext } from '../auth/pageContext'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { PageContainer } from '../components/PageContainer'
import { Textarea } from '../components/Textarea'
import { TextLink } from '../components/TextLink'
import { logEvent } from '../lib/events'
import { supabase } from '../lib/supabase'

const MAX_POSTS = 10
const MAX_POST_LENGTH = 3000
const MAX_RULES = 10
const MAX_RULE_LENGTH = 120

// Each box keeps a stable key so removing one doesn't shift focus or text into its neighbour.
type Box = { key: number; text: string }

let nextKey = 0
const toBox = (text: string): Box => ({ key: nextKey++, text })

export function Voice() {
  const page = usePage()
  const { setPage } = usePageContext()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [pageName, setPageName] = useState(page?.page_name ?? '')
  const [posts, setPosts] = useState<Box[]>(() => (page?.voice_posts.length ? page.voice_posts : ['']).map(toBox))
  const [rules, setRules] = useState<Box[]>(() => (page?.house_rules.length ? page.house_rules : ['']).map(toBox))
  const [nameError, setNameError] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const filledPosts = posts.filter((p) => p.text.trim()).length

  function update(setter: typeof setPosts, key: number, text: string) {
    setter((boxes) => boxes.map((box) => (box.key === key ? { ...box, text } : box)))
  }
  function remove(setter: typeof setPosts, key: number) {
    setter((boxes) => boxes.filter((box) => box.key !== key))
  }
  function add(setter: typeof setPosts) {
    setter((boxes) => [...boxes, toBox('')])
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const name = pageName.trim()
    if (!name) {
      setNameError('Enter your page name.')
      return
    }
    if (!session) return

    setNameError(undefined)
    setSaveError(undefined)
    setSaving(true)

    const voicePosts = posts.map((p) => p.text.trim()).filter(Boolean)
    const houseRules = rules.map((r) => r.text.trim()).filter(Boolean)
    const firstSave = !page

    // One pages row per user: user_id is unique, so this inserts the first time and updates after.
    const { data, error } = await supabase
      .from('pages')
      .upsert(
        { user_id: session.user.id, page_name: name, voice_posts: voicePosts, house_rules: houseRules },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single()

    if (error) {
      setSaving(false)
      setSaveError('Your voice could not be saved. Check your connection and try again.')
      return
    }

    await logEvent('voice_saved', {
      post_count: voicePosts.length,
      rule_count: houseRules.length,
      first_save: firstSave,
    })
    setPage(data)
    navigate('/')
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Voice</h1>
        <p className="text-body text-text-muted">
          distro writes each first draft to sound like your company page. Paste a few posts it should learn from.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Page name"
          value={pageName}
          onChange={(e) => setPageName(e.target.value)}
          error={nameError}
          autoComplete="organization"
        />

        <section className="flex flex-col gap-2">
          <h2 className="text-body font-semibold">Past posts</h2>
          {filledPosts === 0 && (
            <p className="text-body text-text-muted">
              Add 3 or more past posts from your page so the draft sounds like the page. You can save without any.
            </p>
          )}
          {posts.map((post, i) => (
            <div key={post.key} className="flex flex-col gap-1">
              <Textarea
                label={`Post ${i + 1}`}
                value={post.text}
                onChange={(e) => update(setPosts, post.key, e.target.value)}
                maxLength={MAX_POST_LENGTH}
                rows={6}
              />
              <div>
                <TextLink tone="muted" onClick={() => remove(setPosts, post.key)}>
                  Remove post
                </TextLink>
              </div>
            </div>
          ))}
          {posts.length < MAX_POSTS && (
            <div>
              <TextLink onClick={() => add(setPosts)}>Add another post</TextLink>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-body font-semibold">House rules</h2>
          {rules.map((rule, i) => (
            <div key={rule.key} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  label={`Rule ${i + 1}`}
                  value={rule.text}
                  onChange={(e) => update(setRules, rule.key, e.target.value)}
                  maxLength={MAX_RULE_LENGTH}
                />
              </div>
              <div className="pb-1">
                <TextLink tone="muted" onClick={() => remove(setRules, rule.key)}>
                  Remove
                </TextLink>
              </div>
            </div>
          ))}
          {rules.length < MAX_RULES && (
            <div>
              <TextLink onClick={() => add(setRules)}>Add a rule</TextLink>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-1">
          <Button type="submit" disabled={saving} fullWidth>
            {saving ? 'Saving...' : 'Save voice'}
          </Button>
          {saveError && (
            <p className="text-small text-danger" role="alert">
              {saveError}
            </p>
          )}
        </div>
      </form>
    </PageContainer>
  )
}
