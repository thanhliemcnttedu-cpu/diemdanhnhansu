import React, { useState } from 'react';
import { useClassroom } from '../../context/ClassroomContext';
import { Reward } from '../../types';
import { 
  Gift, Plus, Package, ShoppingBag, 
  Check, Trash2, Edit3, Clock, AlertCircle, Sparkles, Crop, Camera 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RewardImageEditorModal } from '../modals/RewardImageEditorModal';

export const RewardsShopView: React.FC = () => {
  const { 
    rewards, addReward, updateReward, deleteReward, 
    currentClassStudents, redeemReward, redemptions, activeClassId 
  } = useClassroom();

  const [isAddRewardOpen, setIsAddRewardOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);

  // Image Editor Modal state (tải ảnh, zoom, xoay, cắt ảnh, kéo vị trí)
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [imageEditorTarget, setImageEditorTarget] = useState<{
    mode: 'add' | 'edit' | 'direct';
    rewardId?: string;
    rewardName?: string;
    currentImage?: string;
  } | null>(null);

  // New reward form
  const [name, setName] = useState('');
  const [cost, setCost] = useState(15);
  const [stock, setStock] = useState(10);
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');

  // Fast redeem modal
  const [selectedRewardToRedeem, setSelectedRewardToRedeem] = useState<Reward | null>(null);
  const [redeemNotice, setRedeemNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Xử lý lưu ảnh sau khi cắt từ bộ chỉnh sửa ảnh quà tặng
  const handleSaveImageFromEditor = (croppedUrl: string) => {
    if (!imageEditorTarget) return;

    if (imageEditorTarget.mode === 'add') {
      setImage(croppedUrl);
    } else if (imageEditorTarget.mode === 'edit') {
      if (editingReward) {
        setEditingReward({ ...editingReward, image: croppedUrl });
      }
    } else if (imageEditorTarget.mode === 'direct') {
      if (imageEditorTarget.rewardId) {
        updateReward(imageEditorTarget.rewardId, { image: croppedUrl });
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
      }
    }
    setIsImageEditorOpen(false);
    setImageEditorTarget(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addReward({
      classId: activeClassId,
      name: name.trim(),
      cost: Math.max(1, cost),
      stock: Math.max(0, stock),
      image: image.trim() || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=80',
      description: description.trim()
    });

    setName('');
    setCost(15);
    setStock(10);
    setImage('');
    setDescription('');
    setIsAddRewardOpen(false);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReward || !editingReward.name.trim()) return;

    updateReward(editingReward.id, {
      name: editingReward.name.trim(),
      cost: Math.max(1, editingReward.cost),
      stock: Math.max(0, editingReward.stock),
      image: editingReward.image,
      description: editingReward.description
    });

    setEditingReward(null);
  };

  const handleRedeem = (studentId: string, reward: Reward) => {
    const res = redeemReward(studentId, reward.id);
    setRedeemNotice(res);
    if (res.success) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      // update selected reward copy for stock sync
      setSelectedRewardToRedeem(prev => prev ? { ...prev, stock: prev.stock - 1 } : null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">
              KHO QUÀ TẶNG & CỬA HÀNG ĐỔI THƯỞNG XU
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 uppercase">
            QUY ĐỔI THÀNH TÍCH HỌC TẬP LẤY QUÀ THỰC TẾ · TỰ ĐỘNG KÍCH HOẠT KHI HỌC SINH TÍCH LŨY ĐỦ XU
          </p>
        </div>

        <button
          onClick={() => setIsAddRewardOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors uppercase hover-zoom-btn"
        >
          <Plus className="w-4 h-4" />
          <span>THÊM PHẦN QUÀ MỚI</span>
        </button>
      </div>

      {/* Rewards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {rewards.map((reward) => {
          // Find eligible students who have enough coins for this reward
          const eligibleStudents = currentClassStudents.filter(s => s.points >= reward.cost);

          return (
            <div
              key={reward.id}
              className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs flex flex-col justify-between hover-zoom-card transition-all group"
            >
              <div>
                {/* Reward Image & Stock Pill */}
                <div className="relative h-44 bg-slate-100 overflow-hidden">
                  <img
                    src={reward.image}
                    alt={reward.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                  {/* Nút sửa ảnh nhanh trực tiếp trên thẻ */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageEditorTarget({
                        mode: 'direct',
                        rewardId: reward.id,
                        rewardName: reward.name,
                        currentImage: reward.image
                      });
                      setIsImageEditorOpen(true);
                    }}
                    className="absolute top-3 left-3 bg-black/60 hover:bg-indigo-600 text-white px-2.5 py-1 rounded-xl text-xs font-bold backdrop-blur-xs shadow-xs transition-all flex items-center gap-1 opacity-85 group-hover:opacity-100 hover:scale-105 active:scale-95 cursor-pointer z-10"
                    title="Tải ảnh, zoom, xoay, cắt và chỉnh sửa ảnh phần quà này"
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Sửa ảnh</span>
                  </button>

                  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-xl text-xs font-bold font-mono shadow-xs text-slate-700 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    <span>Kho: {reward.stock} món</span>
                  </div>

                  <div className="absolute bottom-3 left-3 bg-amber-500 text-white px-3 py-1 rounded-xl text-xs font-bold font-mono shadow-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-200" />
                    <span>{reward.cost} xu</span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-800 line-clamp-1" title={reward.name}>
                      {reward.name}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditingReward(reward)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
                        title="Sửa phần quà"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Bạn có chắc muốn xóa quà "${reward.name}"?`)) {
                            deleteReward(reward.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50"
                        title="Xóa phần quà"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {reward.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {reward.description}
                    </p>
                  )}

                  {/* Auto-activation notification */}
                  <div className="pt-2 text-xs text-slate-600 flex items-center justify-between border-t border-slate-100">
                    <span className="text-[11px] text-slate-500">Đủ điều kiện đổi:</span>
                    <span className="font-bold text-indigo-600 font-mono">
                      {eligibleStudents.length} học sinh
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="p-4 pt-0">
                <button
                  onClick={() => {
                    setSelectedRewardToRedeem(reward);
                    setRedeemNotice(null);
                  }}
                  disabled={reward.stock <= 0}
                  className="w-full py-2.5 px-3 rounded-2xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5 hover-zoom-btn"
                >
                  <Gift className="w-3.5 h-3.5" />
                  <span>{reward.stock > 0 ? 'Đổi phần thưởng này' : 'Hết hàng trong kho'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Redemption History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">
              Nhật ký đổi quà tặng thực tế
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Tổng cộng: <strong className="text-slate-800">{redemptions.length}</strong> lượt đổi
          </span>
        </div>

        {redemptions.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            Chưa có học sinh nào thực hiện đổi quà. Khi học sinh tích đủ xu và đổi, thông tin sẽ được lưu tại đây.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3">Học sinh</th>
                  <th className="py-2.5 px-3">Món quà</th>
                  <th className="py-2.5 px-3 text-right">Xu đã trừ</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {redemptions.map((rdm) => (
                  <tr key={rdm.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      {new Date(rdm.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {rdm.studentName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {rdm.rewardName}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                      -{rdm.cost} xu
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        <Check className="w-3 h-3" />
                        <span>Đã trừ xu & trao quà</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Redeem for a Student */}
      {selectedRewardToRedeem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Xác nhận đổi quà: {selectedRewardToRedeem.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Chi phí: <strong className="text-amber-600 font-mono">{selectedRewardToRedeem.cost} xu</strong> · Kho còn: <strong className="text-slate-700 font-mono">{selectedRewardToRedeem.stock}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedRewardToRedeem(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-semibold"
              >
                Đóng
              </button>
            </div>

            {redeemNotice && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                redeemNotice.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {redeemNotice.success ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{redeemNotice.message}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Chọn em học sinh nhận quà (Hệ thống tự động lọc các em đủ {selectedRewardToRedeem.cost} xu):
              </label>

              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {currentClassStudents.map(student => {
                  const hasEnough = student.points >= selectedRewardToRedeem.cost;
                  return (
                    <div
                      key={student.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                        hasEnough ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={student.avatar}
                          alt={student.name}
                          className="w-7 h-7 rounded-full bg-slate-100 object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="font-semibold text-slate-800">{student.name}</div>
                          <div className="text-[11px] font-mono text-slate-500">Hiện có: {student.points} xu</div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRedeem(student.id, selectedRewardToRedeem)}
                        disabled={!hasEnough || selectedRewardToRedeem.stock <= 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {hasEnough ? 'Đổi quà ngay' : 'Chưa đủ xu'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add New Reward */}
      {isAddRewardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">Thêm phần quà vào kho</h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên phần quà</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bút bi dạ quang, Thước kẻ dẻo..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mốc xu cần đổi</label>
                  <input
                    type="number"
                    min="1"
                    value={cost}
                    onChange={(e) => setCost(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số lượng tồn kho</label>
                  <input
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ảnh minh họa phần quà
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-3">
                    {/* Ảnh xem trước hiện tại */}
                    <div className="relative w-20 h-16 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-slate-300 shadow-2xs">
                      <img
                        src={image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=80'}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="flex-1 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setImageEditorTarget({
                            mode: 'add',
                            rewardName: name.trim() || 'Phần quà mới',
                            currentImage: image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=80'
                          });
                          setIsImageEditorOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <Crop className="w-3.5 h-3.5" />
                        <span>{image ? 'Chỉnh sửa / Cắt lại ảnh' : 'Tải lên & Cắt ảnh quà'}</span>
                      </button>
                      <div className="text-[10px] text-slate-500">
                        Tải ảnh từ máy, zoom, xoay, kéo vị trí và cắt ảnh sắc nét, siêu nhẹ.
                      </div>
                    </div>
                  </div>

                  {/* Hoặc nhập link thủ công nếu muốn */}
                  <input
                    type="text"
                    placeholder="Hoặc dán trực tiếp đường link ảnh (URL)..."
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-[11px] bg-white text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả chi tiết</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả công dụng hoặc kích thước..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddRewardOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Lưu phần quà
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Reward */}
      {editingReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">Chỉnh sửa phần quà</h3>
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên phần quà</label>
                <input
                  type="text"
                  value={editingReward.name}
                  onChange={(e) => setEditingReward({ ...editingReward, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mốc xu cần đổi</label>
                  <input
                    type="number"
                    min="1"
                    value={editingReward.cost}
                    onChange={(e) => setEditingReward({ ...editingReward, cost: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số lượng kho</label>
                  <input
                    type="number"
                    min="0"
                    value={editingReward.stock}
                    onChange={(e) => setEditingReward({ ...editingReward, stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ảnh minh họa phần quà
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-3">
                    {/* Ảnh xem trước hiện tại */}
                    <div className="relative w-20 h-16 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-slate-300 shadow-2xs">
                      <img
                        src={editingReward.image}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="flex-1 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setImageEditorTarget({
                            mode: 'edit',
                            rewardId: editingReward.id,
                            rewardName: editingReward.name,
                            currentImage: editingReward.image
                          });
                          setIsImageEditorOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <Crop className="w-3.5 h-3.5" />
                        <span>Chỉnh sửa / Cắt lại ảnh</span>
                      </button>
                      <div className="text-[10px] text-slate-500">
                        Zoom, xoay góc, kéo vị trí và cắt ảnh theo đúng chuẩn hiển thị.
                      </div>
                    </div>
                  </div>

                  {/* Hoặc nhập link thủ công nếu muốn */}
                  <input
                    type="text"
                    value={editingReward.image}
                    onChange={(e) => setEditingReward({ ...editingReward, image: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-[11px] bg-white text-slate-600"
                    placeholder="Đường link URL ảnh..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingReward(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tải ảnh, Xem trước, Zoom, Xoay, Cắt và Di chuyển ảnh phần quà */}
      {isImageEditorOpen && (
        <RewardImageEditorModal
          isOpen={isImageEditorOpen}
          rewardName={imageEditorTarget?.rewardName || 'phần quà'}
          initialImage={imageEditorTarget?.currentImage || ''}
          onClose={() => {
            setIsImageEditorOpen(false);
            setImageEditorTarget(null);
          }}
          onSave={handleSaveImageFromEditor}
        />
      )}
    </div>
  );
};
