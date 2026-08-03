import http from './http'

export function getMyProfile(userId) {
    return http.get(`/users/${userId}`)
}

export function updateMyProfile(userId, data) {
    return http.put(`/users/${userId}`, data)
}

export function uploadMyAvatar(userId, file) {
    const formData = new FormData()
    formData.append('file', file)

    // 不手动设置 Content-Type，浏览器会自动添加 multipart boundary。
    return http.post(`/users/${userId}/avatar`, formData)
}

export function getSocialIdentities(userId) {
    return http.get(`/users/${userId}/social-identities`)
}

export function unbindSocialIdentity(userId, identityId) {
    return http.delete(
        `/users/${userId}/social-identities/${identityId}`
    )
}