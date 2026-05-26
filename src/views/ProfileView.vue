<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarrySky from '@/components/StarrySky.vue'
import LocationMap from '@/components/LocationMap.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getMyLocations, getMyProfile, updateMyProfile, uploadAvatar } from '@/api/admin'
import { resolveAvatarUrl, validateAvatarFile } from '@/utils/avatar'
import { clearSession, parseTokenPayload, syncSessionUser } from '@/utils/session'

const router = useRouter()
const activeTab = ref('profile')
const profile = reactive({
  userId: '',
  username: sessionStorage.getItem('username') || '',
  nickname: '',
  email: '',
  phone: '',
  avatar: ''
})
const locations = ref([])
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageType = ref('success')
const userId = computed(() => {
  return parseTokenPayload()?.sub || ''
})

function formatTime(value) {
  if (!value) return '-'
  return value.replace('T', ' ')
}

function initials() {
  return (profile.nickname || profile.username || 'U').slice(0, 1).toUpperCase()
}

function avatarSrc(value) {
  return resolveAvatarUrl(value)
}

function cleanText(value) {
  const text = typeof value === 'string' ? value.trim() : value
  return text === '' ? null : text
}

function logout() {
  clearSession('')
  router.push('/login')
}

async function loadData() {
  if (!userId.value) return
  loading.value = true
  message.value = ''
  messageType.value = 'success'
  try {
    const [profileResp, locationResp] = await Promise.all([
      getMyProfile(userId.value),
      getMyLocations({ current: 1, size: 10, userId: userId.value })
    ])
    if (profileResp.data.code === 200) {
      Object.assign(profile, profileResp.data.data)
      syncSessionUser(profile)
    }
    if (locationResp.data.code === 200) {
      locations.value = locationResp.data.data.records || []
    }
  } catch (error) {
    message.value = error.response?.data?.message || '加载失败'
    messageType.value = 'error'
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  saving.value = true
  message.value = ''
  messageType.value = 'success'
  try {
    const { data } = await updateMyProfile(userId.value, {
      nickname: cleanText(profile.nickname),
      email: cleanText(profile.email),
      phone: cleanText(profile.phone),
      avatar: cleanText(profile.avatar)
    })
    if (data.code === 200) {
      Object.assign(profile, data.data)
      syncSessionUser(profile)
      message.value = '保存成功'
      messageType.value = 'success'
    } else {
      message.value = data.message || '保存失败'
      messageType.value = 'error'
    }
  } catch (error) {
    message.value = error.response?.data?.message || '保存失败'
    messageType.value = 'error'
  } finally {
    saving.value = false
  }
}

async function chooseAvatar(event) {
  message.value = ''
  messageType.value = 'success'
  saving.value = true
  try {
    const file = event.target.files?.[0]
    if (!validateAvatarFile(file)) return
    const { data } = await uploadAvatar(userId.value, file)
    if (data.code === 200) {
      profile.avatar = data.data?.url || ''
      syncSessionUser(profile)
      message.value = '头像上传成功'
      messageType.value = 'success'
    } else {
      message.value = data.message || '头像上传失败'
      messageType.value = 'error'
    }
  } catch (error) {
    message.value = error.response?.data?.message || error.message || '头像上传失败'
    messageType.value = 'error'
  } finally {
    saving.value = false
    event.target.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <div class="admin-starry">
    <StarrySky />
    <main class="dashboard-shell glass-shell profile-shell">
      <aside class="dashboard-nav glass-nav">
        <div>
          <p class="nav-kicker">Wifi Manager</p>
          <h1>个人中心</h1>
        </div>
        <nav>
          <button type="button" :class="{ active: activeTab === 'profile' }" @click="activeTab = 'profile'">我的资料</button>
          <button type="button" :class="{ active: activeTab === 'locations' }" @click="activeTab = 'locations'">我的定位</button>
        </nav>
        <button class="ghost-button" type="button" @click="logout">退出登录</button>
      </aside>

      <section class="dashboard-main glass-main">
        <header class="dashboard-header">
          <div>
            <p class="page-kicker">普通用户</p>
            <h2>{{ profile.nickname || profile.username }}</h2>
          </div>
          <button type="button" :disabled="loading" @click="loadData">刷新</button>
        </header>

        <p v-if="message" :class="['alert', messageType]">{{ message }}</p>

        <section v-if="activeTab === 'profile'" class="profile-grid">
          <form class="profile-panel glass-panel" @submit.prevent="saveProfile">
            <div class="avatar-editor">
              <div class="avatar-preview">
                <img v-if="profile.avatar" :src="avatarSrc(profile.avatar)" alt="头像预览" />
                <span v-else>{{ initials() }}</span>
              </div>
              <div>
                <strong>{{ profile.nickname || profile.username }}</strong>
                <p>头像会在保存后同步到个人资料。</p>
              </div>
            </div>

            <label>
              <span>用户名</span>
              <input v-model="profile.username" disabled />
            </label>
            <label>
              <span>昵称</span>
              <input v-model="profile.nickname" />
            </label>
            <label>
              <span>邮箱</span>
              <input v-model="profile.email" type="email" />
            </label>
            <label>
              <span>手机号</span>
              <input v-model="profile.phone" type="tel" />
            </label>
            <label>
              <span>头像地址</span>
              <input v-model="profile.avatar" placeholder="https://..." />
            </label>
            <label>
              <span>上传头像</span>
              <input type="file" accept="image/*" @change="chooseAvatar" />
            </label>
            <button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存资料' }}</button>
          </form>
        </section>

        <template v-else>
          <LocationMap class="location-panel" :locations="locations" title="我的 GPS 轨迹" />

          <section class="table-panel glass-panel">
            <div class="table-summary">
              <strong>{{ locations.length }}</strong>
              <span>条我的定位记录</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>MAC</th>
                  <th>纬度</th>
                  <th>经度</th>
                  <th>精度</th>
                  <th>来源</th>
                  <th>上报时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="6">
                    <StateBlock type="loading" title="正在加载" text="正在同步你的定位记录" />
                  </td>
                </tr>
                <tr v-else-if="locations.length === 0">
                  <td colspan="6">
                    <StateBlock title="暂无定位" text="当前账号还没有 GPS 上报记录" />
                  </td>
                </tr>
                <tr v-for="item in locations" :key="item.id">
                  <td>{{ item.mac }}</td>
                  <td>{{ item.latitude }}</td>
                  <td>{{ item.longitude }}</td>
                  <td>{{ item.accuracy || '-' }}</td>
                  <td>{{ item.source || '-' }}</td>
                  <td>{{ formatTime(item.reportTime) }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>
      </section>
    </main>
  </div>
</template>
