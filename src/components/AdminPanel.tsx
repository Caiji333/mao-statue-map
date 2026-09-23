import { Check, ChevronLeft, ChevronRight, Clock3, KeyRound, MapPin, Search, ShieldCheck, Users, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  adminBatchSetUserRole,
  adminResetUserPassword,
  adminSetUserRole,
  isSystemAdmin,
  formatDisplayTime,
  listAdminContributions,
  listAdminUsers,
  reviewContribution,
  type AdminUserItem,
  type ContributionListItem,
} from '../lib/contributions';
import { pocketbase } from '../lib/pocketbase';
import { ImagePreview } from './ImagePreview';

interface Props { onClose: () => void; onChanged: () => void; onLocate: (item: ContributionListItem) => void; }

const PAGE_SIZE = 10;

export function AdminPanel({ onClose, onChanged, onLocate }: Props) {
  const [tab, setTab] = useState<'reviews' | 'users'>('reviews');
  const [reviewView, setReviewView] = useState<'pending' | 'reviewed'>('pending');
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewReload, setReviewReload] = useState(0);
  const [items, setItems] = useState<ContributionListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resetting, setResetting] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [roleBusy, setRoleBusy] = useState(false);
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const selfEmail = pocketbase?.authStore.record?.email ?? '';
  const canManageRoles = isSystemAdmin(selfEmail);
  const allSelected = users.length > 0 && users.every((user) => selectedUserIds.has(user.id));

  useEffect(() => {
    if (tab !== 'reviews') return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const result = await listAdminContributions({ status: reviewView, page: reviewPage, pageSize: PAGE_SIZE });
      if (cancelled) return;
      setItems(result.items);
      setTotalItems(result.totalItems);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [reviewPage, reviewReload, reviewView, tab]);

  useEffect(() => {
    if (tab !== 'users') return;
    const timer = window.setTimeout(async () => {
      setUserLoading(true);
      setUserMessage('');
      try {
        setUsers(await listAdminUsers(query));
        setSelectedUserIds(new Set());
      } catch (error) {
        setUserMessage(error instanceof Error ? error.message : '读取用户失败');
      }
      setUserLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, tab]);

  const changeReviewView = (next: 'pending' | 'reviewed') => {
    setReviewView(next);
    setReviewPage(1);
  };

  const decide = async (item: ContributionListItem, status: 'approved' | 'rejected') => {
    const adminId = pocketbase?.authStore.record?.id;
    if (!adminId) return;
    setBusy(item.id);
    const comment = comments[item.id]?.trim() || (status === 'approved' ? '管理员审核通过' : '管理员驳回');
    const error = await reviewContribution(item.id, status, comment, adminId);
    if (error) window.alert(error);
    else {
      if (items.length === 1 && reviewPage > 1) setReviewPage((current) => current - 1);
      else setReviewReload((current) => current + 1);
      onChanged();
    }
    setBusy('');
  };

  const resetPassword = async (user: AdminUserItem) => {
    if (!window.confirm(`确认将 ${user.email ?? '该用户'} 的密码重置为 mao123456？`)) return;
    setResetting(user.id);
    setUserMessage('');
    const error = await adminResetUserPassword(user.id);
    setResetting('');
    setUserMessage(error ? error : `${user.email ?? '用户'} 的密码已重置为 mao123456`);
  };

  const toggleSelect = (userId: string) => {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedUserIds(allSelected ? new Set() : new Set(users.map((user) => user.id)));
  };

  const changeOneRole = async (user: AdminUserItem) => {
    if (!canManageRoles) return;
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    setRoleBusy(true);
    setUserMessage('');
    const error = await adminSetUserRole(user.id, nextRole);
    setRoleBusy(false);
    if (error) {
      setUserMessage(error);
      return;
    }
    setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, role: nextRole } : item)));
    setUserMessage(`${user.email ?? '用户'} 已设为${nextRole === 'admin' ? '管理员' : '普通用户'}`);
  };

  const batchChangeRole = async (role: 'user' | 'admin') => {
    if (!canManageRoles) return;
    const ids = [...selectedUserIds];
    if (ids.length === 0) {
      setUserMessage('请先勾选用户');
      return;
    }
    if (!window.confirm(`确认将选中的 ${ids.length} 个账号设为${role === 'admin' ? '管理员' : '普通用户'}？`)) return;
    setRoleBusy(true);
    setUserMessage('');
    const result = await adminBatchSetUserRole(ids, role);
    setRoleBusy(false);
    setUsers((current) => current.map((item) => (selectedUserIds.has(item.id) ? { ...item, role } : item)));
    setSelectedUserIds(new Set());
    setUserMessage(
      result.ok > 0
        ? `已将 ${result.ok} 个账号设为${role === 'admin' ? '管理员' : '普通用户'}${result.error ? `，部分失败：${result.error}` : ''}`
        : (result.error || '调整角色失败'),
    );
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="admin-modal" role="dialog" aria-modal="true">
        <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        <div className="modal-kicker">管理员工作台</div>
        <h2>{tab === 'reviews' ? '投稿审核' : '用户管理'}</h2>
        <div className="admin-tabs">
          <button type="button" className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}><Clock3 size={15} />投稿审核</button>
          <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={15} />用户管理</button>
        </div>

        {tab === 'reviews' ? (
          <>
            <div className="review-view-tabs">
              <button type="button" className={reviewView === 'pending' ? 'active' : ''} onClick={() => changeReviewView('pending')}>待审核贡献</button>
              <button type="button" className={reviewView === 'reviewed' ? 'active' : ''} onClick={() => changeReviewView('reviewed')}>已审核贡献</button>
            </div>
            <p className="modal-copy">{reviewView === 'pending' ? '审核通过后立即公开，驳回记录不会出现在地图。' : '展示已经通过或驳回的历史审核记录。'}</p>
            {loading ? (
              <div className="admin-empty"><Clock3 size={18} />读取贡献记录…</div>
            ) : items.length === 0 ? (
              <div className="admin-empty"><Check size={20} />{reviewView === 'pending' ? '当前没有待审核内容' : '当前没有已审核内容'}</div>
            ) : (
              <div className="review-list">
                {items.map((item) => (
                  <article className="review-item" key={item.id}>
                    <div className="review-item-head">
                      <strong>{String(item.payload.name || '未命名点位')}</strong>
                      <small>用户名：{item.submitter_name ?? '未知用户'} · {item.kind === 'new_statue' ? '新增点位' : '修改建议'} · {formatDisplayTime(item.created_at)}</small>
                    </div>
                    {reviewView === 'reviewed' && (
                      <div className={`review-result ${item.status}`}>
                        <span>{item.status === 'approved' ? '已通过' : '已驳回'}</span>
                        <small>{item.reviewed_at ? `${new Date(item.reviewed_at).toLocaleString('zh-CN')} · 审核人：${item.reviewer_name ?? '未知管理员'}` : `审核人：${item.reviewer_name ?? '未知管理员'}`}</small>
                      </div>
                    )}
                    <p>{[item.payload.province, item.payload.city, item.payload.address].filter(Boolean).join(' · ')}</p>
                    <p>{String(item.payload.desc || '未填写简介')}</p>
                    {item.payload.image_url && <ImagePreview imageClassName="review-photo" src={String(item.payload.image_url)} alt="投稿现场" />}
                    <small>坐标：{String(item.payload.longitude)}, {String(item.payload.latitude)}</small>
                    {item.review_comment && reviewView === 'reviewed' && <p className="review-comment-text">审核意见：{item.review_comment}</p>}
                    <div className="review-actions">
                      <button type="button" className="review-locate" onClick={() => onLocate(item)}><MapPin size={15} />查看位置</button>
                      {reviewView === 'pending' && (
                        <>
                          <button disabled={busy === item.id} className="review-reject" type="button" onClick={() => void decide(item, 'rejected')}><XCircle size={15} />驳回</button>
                          <button disabled={busy === item.id} className="review-approve" type="button" onClick={() => void decide(item, 'approved')}><Check size={15} />通过并公开</button>
                        </>
                      )}
                    </div>
                    {reviewView === 'pending' && (
                      <input
                        className="review-comment"
                        value={comments[item.id] ?? ''}
                        onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="审核意见（可选）"
                      />
                    )}
                  </article>
                ))}
              </div>
            )}
            <div className="review-pagination">
              <span>共 {totalItems} 条</span>
              <div>
                <button type="button" aria-label="上一页" title="上一页" disabled={reviewPage <= 1 || loading} onClick={() => setReviewPage((current) => current - 1)}><ChevronLeft size={16} /></button>
                <span>第 {reviewPage} / {totalPages} 页</span>
                <button type="button" aria-label="下一页" title="下一页" disabled={reviewPage >= totalPages || loading} onClick={() => setReviewPage((current) => current + 1)}><ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        ) : (
          <div className="user-admin">
            <div className="user-search">
              <Search size={16} />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按邮箱/用户名搜索账号" />
            </div>
            {canManageRoles ? (
              <div className="user-batch-bar">
                <label className="user-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  <span>全选</span>
                </label>
                <span className="user-batch-count">已选 {selectedUserIds.size} 人</span>
                <button type="button" disabled={roleBusy || selectedUserIds.size === 0} onClick={() => void batchChangeRole('admin')}>
                  <ShieldCheck size={14} />批量设为管理员
                </button>
                <button type="button" disabled={roleBusy || selectedUserIds.size === 0} onClick={() => void batchChangeRole('user')}>
                  <Users size={14} />批量取消管理员
                </button>
              </div>
            ) : (
              <p className="modal-copy">仅系统管理员（deqiangli23@gmail.com）可调整管理员角色。</p>
            )}
            {userMessage && <p className={userMessage.includes('已设为') || userMessage.includes('已将') ? 'form-success' : 'form-error'}>{userMessage}</p>}
            {userLoading ? (
              <div className="admin-empty"><Clock3 size={18} />读取用户列表…</div>
            ) : users.length === 0 ? (
              <div className="admin-empty"><Users size={18} />没有匹配的用户</div>
            ) : (
              <div className="user-list">
                {users.map((user) => (
                  <article className="user-row" key={user.id}>
                    {canManageRoles && (
                      <label className="user-check">
                        <input type="checkbox" checked={selectedUserIds.has(user.id)} onChange={() => toggleSelect(user.id)} />
                      </label>
                    )}
                    <div>
                      <strong>
                        {user.username || '未设置用户名'}
                        {isSystemAdmin(user.email) && <span className="user-badge-sys">系统管理员</span>}
                        {user.role === 'admin' && <span className="user-badge">管理员</span>}
                      </strong>
                      <small>{user.email ?? '未填写邮箱'} · {formatDisplayTime(user.created_at)} · {user.role === 'admin' ? '管理员' : '普通用户'}</small>
                    </div>
                    <div className="user-row-actions">
                      {canManageRoles && !isSystemAdmin(user.email) && (
                        <button type="button" disabled={roleBusy} onClick={() => void changeOneRole(user)}>
                          <ShieldCheck size={14} />{user.role === 'admin' ? '取消管理员' : '设为管理员'}
                        </button>
                      )}
                      <button type="button" disabled={resetting === user.id} onClick={() => void resetPassword(user)}>
                        <KeyRound size={14} />{resetting === user.id ? '重置中…' : '重置密码'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
