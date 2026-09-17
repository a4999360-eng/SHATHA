/**
 * متجر شذى للهدايا والزهور المصنوعة يدوياً (SHATHA)
 * تطبيق جافاسكريبت متكامل لإدارة السلة والمنتجات المصنوعة يدوياً (ورد ستان، بوكيهات فلوس، بوكيهات حلوى)
 * مع خاصية الطلب المباشر عبر واتساب لكل منتج داخل السلة
 * رقم الواتساب الرسمي: 01102541236 (+201102541236)
 */

const SHATHA_CONFIG = {
  storeName: "شذى للهدايا والورد المصنوع يدوياً",
  whatsappNumber: "201102541236", // 01102541236
  googleClientId: "452956702998-ivve5qvsvi174l08a3bbfep4cmkqn6o3.apps.googleusercontent.com",
  ownerEmail: "a4999360@gmail.com", // الحساب الخاص بمالك المتجر شذى
  defaultCoupon: "SHATHA10",
  discountPercent: 10,
  freeShippingThreshold: 1000,
  currency: "ج.م"
};

// حالة التطبيق
let appState = {
  currentUser: null, // بيانات المستخدم المسجل بجوجل { id, name, email, picture, couponCode, couponUsed }
  products: typeof SHATHA_PRODUCTS !== 'undefined' ? SHATHA_PRODUCTS : [],
  shippingZones: typeof SHATHA_SHIPPING_ZONES !== 'undefined' ? SHATHA_SHIPPING_ZONES : [],
  searchQuery: "",
  sortBy: "default",
  selectedProduct: null,
  selectedSize: "standard",
  cart: [],
  appliedCoupon: null,
  selectedShippingZone: "cairo",
  giftCard: {
    enabled: false,
    message: ""
  },
  selectedPaymentMethod: "vodafone"
};

// تحميل السلة من المتصفح
function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('shatha_cart_items');
    if (saved) {
      appState.cart = JSON.parse(saved);
    }
    const savedCoupon = localStorage.getItem('shatha_applied_coupon');
    if (savedCoupon) {
      appState.appliedCoupon = savedCoupon;
    }
  } catch (e) {
    console.warn("Error loading cart", e);
  }
}

// حفظ السلة
function saveCartToStorage() {
  try {
    localStorage.setItem('shatha_cart_items', JSON.stringify(appState.cart));
    if (appState.appliedCoupon) {
      localStorage.setItem('shatha_applied_coupon', appState.appliedCoupon);
    } else {
      localStorage.removeItem('shatha_applied_coupon');
    }
  } catch (e) {
    console.warn("Error saving cart", e);
  }
}

// التحقق من هوية مالك المتجر
function isCurrentUserOwner() {
  return appState.currentUser && 
         appState.currentUser.email && 
         appState.currentUser.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim();
}

/* ==========================================================================
   محرك المزامنة السحابية الفورية (Cloud Sync Engine)
   يتيح مزامنة المنتجات وتعديلات المالك والآراء عبر كافة الأجهزة والهواتف عالمياً
   ========================================================================== */
const SHATHA_CLOUD = {
  endpoint: "https://kvdb.io/4aY47vLpW9vW1pM6L6UuG9/shatha_",
  async get(key) {
    try {
      const res = await fetch(`${this.endpoint}${key}?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Cloud sync read error (${key}):`, e);
    }
    return null;
  },
  async set(key, data) {
    try {
      await fetch(`${this.endpoint}${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.warn(`Cloud sync write error (${key}):`, e);
    }
  }
};

// مزامنة المنتجات في الخلفية من السحابة لجميع الهواتف
async function syncProductsFromCloud() {
  try {
    const cloudProds = await SHATHA_CLOUD.get('products');
    if (Array.isArray(cloudProds) && cloudProds.length > 0) {
      appState.products = cloudProds;
      localStorage.setItem('shatha_all_products_v2', JSON.stringify(cloudProds));
      renderProducts();
    }
  } catch (e) {
    console.warn("Products cloud sync note:", e);
  }
}

// مزامنة آراء المتجر من السحابة لجميع الهواتف
async function syncStoreReviewsFromCloud() {
  try {
    const cloudReviews = await SHATHA_CLOUD.get('store_reviews');
    if (Array.isArray(cloudReviews) && cloudReviews.length > 0) {
      localStorage.setItem('shatha_store_reviews', JSON.stringify(cloudReviews));
      renderStoreTestimonials();
    }
  } catch (e) {
    console.warn("Reviews cloud sync note:", e);
  }
}

// تحميل ودمج المنتجات مع التعديلات المحفوظة
function loadAllProducts() {
  try {
    const savedAll = localStorage.getItem('shatha_all_products_v2');
    if (savedAll) {
      const parsed = JSON.parse(savedAll);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    let defaultProds = typeof SHATHA_PRODUCTS !== 'undefined' ? [...SHATHA_PRODUCTS] : [];
    const customProdsJson = localStorage.getItem('shatha_custom_products');
    if (customProdsJson) {
      const customProds = JSON.parse(customProdsJson);
      if (Array.isArray(customProds) && customProds.length > 0) {
        defaultProds = [...customProds, ...defaultProds];
      }
    }
    localStorage.setItem('shatha_all_products_v2', JSON.stringify(defaultProds));
    return defaultProds;
  } catch (e) {
    console.warn("Error loading products:", e);
  }
  return typeof SHATHA_PRODUCTS !== 'undefined' ? [...SHATHA_PRODUCTS] : [];
}

// حفظ كافة المنتجات في التخزين المحلي ورفعها سحابياً لكافة المستخدمين
function saveAllProductsToStorage() {
  try {
    localStorage.setItem('shatha_all_products_v2', JSON.stringify(appState.products));
    // مزامنة فورية على السحابة لتظهر التعديلات على كافة هواتف العملاء والمالك
    SHATHA_CLOUD.set('products', appState.products);
  } catch (e) {
    console.error("Error saving products to storage:", e);
  }
}

// تصدير كود ملف products-data.js للمالك إذا رغب بحفظ نسخة دائمة
function exportProductsDataCode() {
  const code = `/**\n * ملف بيانات منتجات متجر شذى المحدث تلقائياً\n * تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}\n */\n\nconst FLOURS_PATH = "FLOURS/";\n\nconst SHATHA_PRODUCTS = ${JSON.stringify(appState.products, null, 2)};\n`;
  navigator.clipboard?.writeText(code);
  showToast("تم نسخ كود المنتجات بالكامل للحافظة! يمكنك لصقه بملف products-data.js", "success");
}

// بدء التشغيل
document.addEventListener("DOMContentLoaded", () => {
  appState.products = loadAllProducts();
  loadCurrentUser();
  loadCartFromStorage();
  renderProducts();
  renderStoreTestimonials();
  updateCartUI();
  setupEventListeners();
  setupShippingDropdown();
  initGoogleSignIn();
  // مزامنة سحابية فورية في الخلفية لضمان تطابق البيانات مع سحابة شذى
  syncProductsFromCloud();
  syncStoreReviewsFromCloud();
});

// إعداد المستمعين
function setupEventListeners() {
  // شريط التمرير
  window.addEventListener("scroll", () => {
    const header = document.querySelector(".main-header");
    if (window.scrollY > 40) {
      header?.classList.add("scrolled");
    } else {
      header?.classList.remove("scrolled");
    }
  });

  // قائمة الموبايل
  const mobileToggle = document.getElementById("mobileToggle");
  const navMenu = document.getElementById("navMenu");
  mobileToggle?.addEventListener("click", () => {
    navMenu?.classList.toggle("active");
  });

  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      navMenu?.classList.remove("active");
    });
  });

  // أزرار السلة
  document.getElementById("cartTriggerBtn")?.addEventListener("click", openCartDrawer);
  document.getElementById("closeDrawerBtn")?.addEventListener("click", closeCartDrawer);

  // إغلاق المودالات
  document.getElementById("modalBackdrop")?.addEventListener("click", () => {
    closeAllModals();
  });

  // البحث الفوري
  const searchInput = document.getElementById("productSearchInput");
  searchInput?.addEventListener("input", (e) => {
    appState.searchQuery = e.target.value.trim().toLowerCase();
    renderProducts();
  });

  // الترتيب
  const sortSelect = document.getElementById("sortSelect");
  sortSelect?.addEventListener("change", (e) => {
    appState.sortBy = e.target.value;
    renderProducts();
  });

  // نسخ كود الخصم
  document.getElementById("couponPill")?.addEventListener("click", () => {
    copyMyCoupon();
  });

  // تطبيق الكوبون
  document.getElementById("applyCouponBtn")?.addEventListener("click", () => {
    const code = document.getElementById("couponInput")?.value.trim();
    if (code) {
      applyCouponCode(code);
    }
  });

  // كارت الإهداء
  const giftCheckbox = document.getElementById("giftCardToggle");
  giftCheckbox?.addEventListener("change", (e) => {
    appState.giftCard.enabled = e.target.checked;
    const msgBox = document.getElementById("giftCardMsgWrapper");
    if (msgBox) {
      msgBox.style.display = e.target.checked ? "block" : "none";
    }
  });

  // موافق على الطلب والانتقال لصفحة الدفع المخصصة checkout.html
  document.getElementById("proceedCheckoutBtn")?.addEventListener("click", () => {
    if (appState.cart.length === 0) {
      showToast("سلة المشتريات فارغة! يرجى اختيار باقة أولاً", "error");
      return;
    }
    window.location.href = "checkout.html";
  });

  // إرسال كامل السلة عبر واتساب مباشرة
  document.getElementById("cartDirectWhatsappBtn")?.addEventListener("click", () => {
    sendFullCartDirectToWhatsapp();
  });

  // إغلاق مودالات
  document.getElementById("closeProductModal")?.addEventListener("click", closeProductModal);
  document.getElementById("closeCheckoutModal")?.addEventListener("click", closeCheckoutModal);

  // طرق الدفع
  document.querySelectorAll(".payment-option-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".payment-option-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      appState.selectedPaymentMethod = card.getAttribute("data-method");
    });
  });

  // تغيير المحافظة
  document.getElementById("checkoutGovernorate")?.addEventListener("change", (e) => {
    appState.selectedShippingZone = e.target.value;
    updateCheckoutSummary();
  });

  // تأكيد الطلب
  document.getElementById("confirmOrderBtn")?.addEventListener("click", handleCheckoutSubmit);

  // النشرة البريدية
  document.getElementById("newsletterForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    showToast("شكراً لانضمامك لعائلة شذى! تم حفظ بياناتك لعروضنا القادمة.", "success");
    document.getElementById("newsletterEmail").value = "";
  });
}

// رسم جميع المنتجات في شبكة موحدة بدون فئات
function renderProducts() {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  let filtered = [...appState.products];

  // فلتر البحث بالاسم أو الوصف أو الخامات
  if (appState.searchQuery) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(appState.searchQuery) ||
      p.shortDesc.toLowerCase().includes(appState.searchQuery) ||
      (p.materials && p.materials.toLowerCase().includes(appState.searchQuery))
    );
  }

  // الترتيب
  if (appState.sortBy === "price-low") {
    filtered.sort((a, b) => a.basePrice - b.basePrice);
  } else if (appState.sortBy === "price-high") {
    filtered.sort((a, b) => b.basePrice - a.basePrice);
  } else if (appState.sortBy === "rating") {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <i class="fas fa-search" style="font-size: 3rem; color: var(--primary-pink); margin-bottom: 15px; opacity: 0.6;"></i>
        <h3 style="color: var(--primary-dark); margin-bottom: 8px;">لم نجد نتائج مطابقة لبحثك</h3>
        <p style="color: var(--text-muted);">جرب البحث بكلمات أخرى مثل "ستان" أو "فلوس" أو "حلوى".</p>
        <button class="btn-primary" style="margin-top: 20px;" onclick="document.getElementById('productSearchInput').value=''; appState.searchQuery=''; renderProducts();">عرض جميع المنتجات</button>
      </div>
    `;
    return;
  }

  const isOwner = isCurrentUserOwner();

  grid.innerHTML = filtered.map(product => {
    const discountPercent = product.oldPrice ? Math.round(((product.oldPrice - product.basePrice) / product.oldPrice) * 100) : null;
    const badgeText = product.tag || (discountPercent ? `خصم ${discountPercent}%` : null);

    return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-thumb-wrap" onclick="openProductModal('${product.id}')">
          <img src="${product.images[0]}" alt="${product.name}" class="product-img" loading="lazy">
          ${badgeText ? `<span class="product-badge">${badgeText}</span>` : ''}
          ${isOwner ? `
            <div class="admin-card-badge-tools">
              <button type="button" class="btn-admin-icon edit" onclick="event.stopPropagation(); openEditProductModal('${product.id}')" title="تعديل بيانات وصور الباقة">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="btn-admin-icon delete" onclick="event.stopPropagation(); deleteProductById('${product.id}')" title="حذف الباقة نهائياً من المتجر">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          ` : ''}
          <button class="quick-view-overlay-btn" type="button">
            <i class="fas fa-eye"></i> تفاصيل الباقة والزوايا (${product.images.length} صور)
          </button>
        </div>
        
        <div class="product-info">
          <h3 class="product-title" onclick="openProductModal('${product.id}')">${product.name}</h3>
          
          <p class="product-short-desc-text" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${product.shortDesc}
          </p>

          <div class="product-rating">
            <span>★</span>
            <strong>${product.rating}</strong>
            <span class="reviews-count">(${product.reviewsCount} تقييم حقيقي)</span>
          </div>

          <div class="product-price-row">
            <span class="current-price">${product.basePrice} <span class="currency">ج.م</span></span>
            ${product.oldPrice ? `<span class="old-price">${product.oldPrice} ج.م</span>` : ''}
          </div>

          <div class="product-card-actions">
            <button class="btn-add-cart" onclick="quickAddToCart('${product.id}')" style="width: 100%;">
              <i class="fas fa-shopping-bag"></i> أضف للسلة
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// إضافة سريعة بالحجم الأساسي للسلة
function quickAddToCart(productId) {
  const product = appState.products.find(p => p.id === productId);
  if (!product) return;

  const defaultSize = product.sizes[0];
  addToCart(product, defaultSize, 1);
  showToast(`تمت إضافة "${product.name}" إلى سلتك 🌸`, "success");
}

// فتح نافذة تفاصيل المنتج المتقدمة
function openProductModal(productId) {
  const product = appState.products.find(p => p.id === productId);
  if (!product) return;

  appState.selectedProduct = product;
  appState.selectedSize = product.sizes[0].id;

  const modal = document.getElementById("productDetailsModal");
  const backdrop = document.getElementById("modalBackdrop");

  // تجهيز معرض الصور والزوايا
  const mainImg = document.getElementById("modalMainImg");
  const thumbsContainer = document.getElementById("modalThumbnailsContainer");

  if (mainImg) mainImg.src = product.images[0];

  if (thumbsContainer) {
    if (product.images.length > 1) {
      thumbsContainer.style.display = "flex";
      thumbsContainer.innerHTML = product.images.map((img, idx) => `
        <div class="modal-thumb ${idx === 0 ? 'active' : ''}" onclick="switchModalImage('${img}', this)">
          <img src="${img}" alt="زاوية ${idx + 1}">
        </div>
      `).join('');
    } else {
      thumbsContainer.style.display = "none";
    }
  }

  // أدوات المالك داخل نافذة التفاصيل
  const ownerTools = document.getElementById("modalOwnerTools");
  const isOwner = isCurrentUserOwner();
  if (ownerTools) {
    if (isOwner) {
      ownerTools.style.display = "flex";
      ownerTools.innerHTML = `
        <span style="font-weight: 700; color: #D35400; font-size: 0.85rem;"><i class="fas fa-crown"></i> إدارة الباقة (المالك):</span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-modal-admin edit" onclick="openEditProductModal('${product.id}')"><i class="fas fa-pen"></i> تعديل محتوى الباقة</button>
          <button type="button" class="btn-modal-admin delete" onclick="deleteProductById('${product.id}')"><i class="fas fa-trash-alt"></i> حذف الباقة</button>
        </div>
      `;
    } else {
      ownerTools.style.display = "none";
    }
  }

  // إخفاء صندوق كتابة التقييم عند الفتح وتصفيره
  const reviewFormBox = document.getElementById("prodReviewFormBox");
  if (reviewFormBox) reviewFormBox.style.display = "none";

  // ملء النصوص والبيانات
  document.getElementById("modalProductTitle").innerText = product.name;
  document.getElementById("modalProductRating").innerText = product.rating;
  document.getElementById("modalProductReviewsCount").innerText = `(${product.reviewsCount} تقييم)`;
  document.getElementById("modalProductDesc").innerText = product.shortDesc;

  // الخامات والتصنيع
  const materialsBox = document.getElementById("modalMaterialsText");
  if (materialsBox && product.materials) {
    materialsBox.innerText = product.materials;
  }
  const craftBox = document.getElementById("modalCraftText");
  if (craftBox && product.craftsmanship) {
    craftBox.innerText = product.craftsmanship;
  }

  // محدد الأحجام والمقاسات
  renderModalSizes(product);
  updateModalPrice(product);

  // الميزات والضمانات
  const advList = document.getElementById("modalAdvantagesList");
  if (advList && product.advantages) {
    advList.innerHTML = product.advantages.map(adv => `<li>${adv}</li>`).join('');
  }

  // تقييمات العملاء
  renderModalReviews(product);

  // زر الإضافة للسلة من داخل المودال
  const addBtn = document.getElementById("modalAddToCartBtn");
  if (addBtn) {
    addBtn.onclick = () => {
      const selectedSizeObj = product.sizes.find(s => s.id === appState.selectedSize) || product.sizes[0];
      addToCart(product, selectedSizeObj, 1);
      showToast(`تمت إضافة "${product.name} - ${selectedSizeObj.name}" للسلة!`, "success");
      closeProductModal();
      openCartDrawer();
    };
  }

  backdrop?.classList.add("active");
  modal?.classList.add("active");
  document.body.style.overflow = "hidden";
}

// تبديل زوايا وصور المعرض
function switchModalImage(imgSrc, thumbElement) {
  const mainImg = document.getElementById("modalMainImg");
  if (mainImg) mainImg.src = imgSrc;

  document.querySelectorAll(".modal-thumb").forEach(t => t.classList.remove("active"));
  thumbElement.classList.add("active");
}

// رسم خيارات الأحجام
function renderModalSizes(product) {
  const container = document.getElementById("modalSizesContainer");
  if (!container) return;

  container.innerHTML = product.sizes.map(size => `
    <div class="size-radio-option ${appState.selectedSize === size.id ? 'selected' : ''}" 
         onclick="selectModalSize('${size.id}')">
      <div class="size-info">
        <h6>${size.name}</h6>
        <p>${size.stems} • ${size.sizeLabel} • ${size.desc}</p>
      </div>
      <span class="size-price-tag">${size.price} ج.م</span>
    </div>
  `).join('');
}

function selectModalSize(sizeId) {
  appState.selectedSize = sizeId;
  if (appState.selectedProduct) {
    renderModalSizes(appState.selectedProduct);
    updateModalPrice(appState.selectedProduct);
  }
}

function updateModalPrice(product) {
  const sizeObj = product.sizes.find(s => s.id === appState.selectedSize) || product.sizes[0];
  const priceElem = document.getElementById("modalCurrentPrice");
  if (priceElem) {
    priceElem.innerHTML = `${sizeObj.price} <span class="currency">ج.م</span>`;
  }
}

function renderModalReviews(product) {
  const container = document.getElementById("modalReviewsList");
  if (!container) return;

  if (!product.reviews || product.reviews.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">كن أول من يقيّم هذه الباقة المصنوعة يدوياً!</p>`;
    return;
  }

  const isOwner = isCurrentUserOwner();
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');

  container.innerHTML = product.reviews.map((rev, idx) => {
    if (!rev.id) {
      rev.id = `pr_${product.id}_${idx}`;
    }
    const isMyReview = (rev.id && myReviews.includes(rev.id)) || 
                       (appState.currentUser && rev.authorEmail && rev.authorEmail.toLowerCase() === appState.currentUser.email.toLowerCase());
    const canDelete = isOwner || isMyReview;

    return `
      <div style="background: var(--bg-body); padding: 12px 16px; border-radius: var(--radius-md); margin-bottom: 10px; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: var(--text-main); font-size: 0.9rem;">${rev.author}</strong>
            ${isMyReview ? '<span style="font-size: 0.7rem; background: var(--bg-card); color: var(--primary-pink); padding: 2px 6px; border-radius: 6px; font-weight: 600;">تقييمك</span>' : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #F5A623; font-size: 0.85rem;">★ ${rev.rating}</span>
            ${canDelete ? `
              <button type="button" 
                      class="btn-del-review" 
                      onclick="event.stopPropagation(); deleteProductReview('${product.id}', ${idx})" 
                      title="${isOwner ? 'حذف هذا التقييم نهائياً (صلاحية المالك)' : 'حذف تقييمي'}">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : ''}
          </div>
        </div>
        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.6; margin: 4px 0;">${rev.comment}</p>
        <small style="color: var(--text-light); font-size: 0.75rem;">${rev.date || 'مؤخراً'}</small>
      </div>
    `;
  }).join('');
}

// حذف تقييم منتج (للمالك على أي تقييم، وللعميل على تقييمه الخاص)
function deleteProductReview(productId, reviewIdx) {
  const isOwner = isCurrentUserOwner();
  const prod = appState.products.find(p => p.id === productId);
  if (!prod || !prod.reviews || !prod.reviews[reviewIdx]) return;

  const rev = prod.reviews[reviewIdx];
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
  const isMyReview = (rev.id && myReviews.includes(rev.id)) || 
                     (appState.currentUser && rev.authorEmail && rev.authorEmail.toLowerCase() === appState.currentUser.email.toLowerCase());

  if (!isOwner && !isMyReview) {
    showToast("عذراً، لا تملك صلاحية حذف هذا التقييم", "error");
    return;
  }

  if (!confirm("هل أنت متأكد من رغبتك في حذف هذا التقييم نهائياً؟")) return;

  prod.reviews.splice(reviewIdx, 1);
  prod.reviewsCount = prod.reviews.length;
  if (prod.reviews.length > 0) {
    const sum = prod.reviews.reduce((acc, r) => acc + (parseFloat(r.rating) || 5), 0);
    prod.rating = (sum / prod.reviews.length).toFixed(1);
  } else {
    prod.rating = "5.0";
  }

  saveAllProductsToStorage();
  renderModalReviews(prod);

  const rElem = document.getElementById("modalProductRating");
  const cElem = document.getElementById("modalProductReviewsCount");
  if (rElem) rElem.innerText = prod.rating;
  if (cElem) cElem.innerText = `(${prod.reviewsCount} تقييم)`;

  renderProducts();
  showToast(isOwner ? "تم حذف التقييم نهائياً بصلاحية المالك ومزامنته سحابياً 🌸" : "تم حذف تقييمك بنجاح", "success");
}

// تبديل إظهار/إخفاء نموذج تقييم الباقة
function toggleProdReviewForm() {
  const box = document.getElementById("prodReviewFormBox");
  if (!box) return;
  box.style.display = box.style.display === "none" ? "block" : "none";
}

// ضبط عدد النجوم في تقييم الباقة
function setProdRating(val) {
  const hiddenInput = document.getElementById("prRatingVal");
  if (hiddenInput) hiddenInput.value = val;
  const stars = document.querySelectorAll("#prodRatingStars i");
  stars.forEach((s, idx) => {
    if (idx < val) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
  });
}

// إرسال تقييم جديد للباقة الحالية
function handleProductReviewSubmit(e) {
  e.preventDefault();
  if (!appState.selectedProduct) return;

  const author = document.getElementById("prAuthor")?.value.trim() || (appState.currentUser?.name || "عميل شذى");
  const rating = parseInt(document.getElementById("prRatingVal")?.value) || 5;
  const comment = document.getElementById("prComment")?.value.trim();

  if (!comment) {
    showToast("يرجى كتابة رأيك في الباقة أولاً", "error");
    return;
  }

  if (!Array.isArray(appState.selectedProduct.reviews)) {
    appState.selectedProduct.reviews = [];
  }

  const reviewId = 'pr_' + Date.now();
  const newReview = {
    id: reviewId,
    author: author,
    authorEmail: appState.currentUser?.email || '',
    rating: rating,
    comment: comment,
    date: "الآن"
  };

  appState.selectedProduct.reviews.unshift(newReview);
  appState.selectedProduct.reviewsCount = appState.selectedProduct.reviews.length;
  
  // إعادة حساب متوسط التقييم
  const sum = appState.selectedProduct.reviews.reduce((acc, r) => acc + (parseFloat(r.rating) || 5), 0);
  appState.selectedProduct.rating = (sum / appState.selectedProduct.reviews.length).toFixed(1);

  // حفظ في قائمة تقييماتي للعميل لتمكينه من حذفه
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
  myReviews.push(reviewId);
  localStorage.setItem('shatha_my_reviews', JSON.stringify(myReviews));

  saveAllProductsToStorage();
  renderModalReviews(appState.selectedProduct);
  
  // تحديث النصوص في النافذة والبطاقة
  const rElem = document.getElementById("modalProductRating");
  const cElem = document.getElementById("modalProductReviewsCount");
  if (rElem) rElem.innerText = appState.selectedProduct.rating;
  if (cElem) cElem.innerText = `(${appState.selectedProduct.reviewsCount} تقييم)`;

  renderProducts();

  // إفراغ النموذج وإخفائه
  document.getElementById("prComment").value = "";
  toggleProdReviewForm();
  showToast("شكراً لمشاركتك! تمت إضافة تقييمك ومزامنته سحابياً بنجاح 🌸", "success");
}

/* ==========================================================================
   نظام آراء وتقييمات المتجر بالكامل (Store-Wide Testimonials)
   مع إمكانية الحذف الفوري للمالك ومزامنتها سحابياً لجميع الزوار
   ========================================================================== */
const DEFAULT_STORE_REVIEWS = [
  {
    id: "sr_def_1",
    author: "نورهان حسين",
    location: "القاهرة • بوكيه ورد ستان أحمر ملكي",
    rating: 5,
    comment: "بوكيه الورد الستان طلع في الحقيقة خيال! لمعة الستان والتغليف الأسود مع الأحمر مدي شياكة مش طبيعية، وأجمل حاجة إنه هيفضل ذكرى دايمة مش بيذبل خالص."
  },
  {
    id: "sr_def_2",
    author: "محمود عبد العزيز",
    location: "التجمع الخامس • بوكيه النقود الملكي الضخم",
    rating: 5,
    comment: "طلبت بوكيه الفلوس الملكي في خطوبة أختي وكان مفاجأة الحفلة كلها! لف الفلوس متقن جداً ونظيف ومن غير ما تتجرح، ذوق عالي والتزام في الميعاد."
  },
  {
    id: "sr_def_3",
    author: "سارة منصور",
    location: "الشيخ زايد • بوكيه حلوى اللولي بوب",
    rating: 5,
    comment: "بوكيهات اللولي بوب كانت كيوت ومبهجة جداً! أصحابي في حفلة التخرج طاروا بيها من الفرحة، والتعامل على الواتساب راقي وسريع جداً."
  }
];

function loadStoreReviews() {
  try {
    const saved = localStorage.getItem('shatha_store_reviews');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error loading store reviews:", e);
  }
  return [...DEFAULT_STORE_REVIEWS];
}

function saveStoreReviews(reviews) {
  try {
    localStorage.setItem('shatha_store_reviews', JSON.stringify(reviews));
    SHATHA_CLOUD.set('store_reviews', reviews);
  } catch (e) {
    console.error("Error saving store reviews:", e);
  }
}

function renderStoreTestimonials() {
  const grid = document.getElementById("testimonialsGrid");
  if (!grid) return;

  const reviews = loadStoreReviews();
  const isOwner = isCurrentUserOwner();
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');

  grid.innerHTML = reviews.map(rev => {
    const stars = '★'.repeat(rev.rating || 5);
    const initials = rev.author ? rev.author.split(' ').map(w => w[0]).join('.').slice(0, 5) : 'ع.ش';
    const isMyReview = (rev.id && myReviews.includes(rev.id)) || 
                       (appState.currentUser && rev.authorEmail && rev.authorEmail.toLowerCase() === appState.currentUser.email.toLowerCase());
    const canDelete = isOwner || isMyReview;

    return `
      <div class="testimonial-card">
        ${canDelete ? `
          <button type="button" 
                  class="btn-del-review" 
                  onclick="event.stopPropagation(); deleteStoreReview('${rev.id}')" 
                  title="${isOwner ? 'حذف هذا الرأي نهائياً كمالك للمتجر' : 'حذف رأيي'}">
            <i class="fas fa-trash-alt"></i>
          </button>
        ` : ''}
        <div class="testimonial-stars" style="color: #F5A623;">${stars}</div>
        <p class="testimonial-quote">"${rev.comment}"</p>
        <div class="testimonial-author">
          <div class="author-avatar">${initials}</div>
          <div class="author-info">
            <h5>${rev.author} ${isMyReview ? '<span style="font-size: 0.7rem; color: var(--primary-pink);">(رأيك)</span>' : ''}</h5>
            <span>${rev.location || 'عميل موثوق • متجر شذى'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// حذف رأي من آراء المتجر
function deleteStoreReview(revId) {
  const isOwner = isCurrentUserOwner();
  const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
  const reviews = loadStoreReviews();
  const targetRev = reviews.find(r => String(r.id) === String(revId));

  if (!targetRev) return;

  const isMyReview = (targetRev.id && myReviews.includes(targetRev.id)) || 
                     (appState.currentUser && targetRev.authorEmail && targetRev.authorEmail.toLowerCase() === appState.currentUser.email.toLowerCase());

  if (!isOwner && !isMyReview) {
    showToast("عذراً، لا تملك صلاحية حذف هذا الرأي", "error");
    return;
  }

  if (!confirm("هل أنت متأكد من رغبتك في حذف هذا الرأي نهائياً؟ سيتم حذفه من كافة الأجهزة.")) return;

  const updated = reviews.filter(r => String(r.id) !== String(revId));
  saveStoreReviews(updated);
  renderStoreTestimonials();
  showToast(isOwner ? "تم حذف الرأي نهائياً بصلاحية المالك ومزامنته سحابياً 🌸" : "تم حذف رأيك بنجاح", "success");
}

function toggleStoreReviewForm() {
  const card = document.getElementById("storeReviewFormCard");
  if (!card) return;
  card.classList.toggle("active");
  if (card.classList.contains("active")) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("srAuthor")?.focus();
  }
}

function setStoreRating(val) {
  const input = document.getElementById("srRatingVal");
  if (input) input.value = val;
  const stars = document.querySelectorAll("#storeRatingStars i");
  stars.forEach((s, idx) => {
    if (idx < val) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
  });
}

function handleStoreReviewSubmit(e) {
  e.preventDefault();
  const author = document.getElementById("srAuthor")?.value.trim() || (appState.currentUser?.name || "عميل متجر شذى");
  const location = document.getElementById("srLocation")?.value.trim() || "عميل متجر شذى";
  const rating = parseInt(document.getElementById("srRatingVal")?.value) || 5;
  const comment = document.getElementById("srComment")?.value.trim();

  if (!author || !comment) {
    showToast("يرجى ملء الاسم والتعليق أولاً", "error");
    return;
  }

  const reviewId = 'sr_' + Date.now();
  const newReview = {
    id: reviewId,
    author,
    authorEmail: appState.currentUser?.email || '',
    location,
    rating,
    comment,
    date: new Date().toLocaleDateString('ar-EG')
  };

  try {
    let reviews = loadStoreReviews();
    reviews.unshift(newReview);
    saveStoreReviews(reviews);

    // تسجيل المعرف في تقييماتي للعميل
    const myReviews = JSON.parse(localStorage.getItem('shatha_my_reviews') || '[]');
    myReviews.push(reviewId);
    localStorage.setItem('shatha_my_reviews', JSON.stringify(myReviews));

    renderStoreTestimonials();
    toggleStoreReviewForm();
    document.getElementById("storeReviewForm")?.reset();
    setStoreRating(5);
    showToast("شكراً لمشاركتك! تم نشر رأيك ومزامنته سحابياً بنجاح 🌸", "success");
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء حفظ تقييمك", "error");
  }
}

function closeProductModal() {
  const modal = document.getElementById("productDetailsModal");
  modal?.classList.remove("active");
  if (!document.querySelector(".cart-drawer.active") && !document.querySelector(".checkout-modal.active")) {
    document.getElementById("modalBackdrop")?.classList.remove("active");
    document.body.style.overflow = "";
  }
}

// إضافة منتج للسلة
function addToCart(product, sizeObj, quantity = 1) {
  const cartItemKey = `${product.id}-${sizeObj.id}`;
  const existingIndex = appState.cart.findIndex(i => i.cartKey === cartItemKey);

  if (existingIndex > -1) {
    appState.cart[existingIndex].quantity += quantity;
  } else {
    appState.cart.push({
      cartKey: cartItemKey,
      productId: product.id,
      name: product.name,
      image: product.images[0],
      sizeId: sizeObj.id,
      sizeName: sizeObj.name,
      price: sizeObj.price,
      quantity: quantity
    });
  }

  saveCartToStorage();
  updateCartUI();
}

function updateCartItemQuantity(cartKey, delta) {
  const itemIndex = appState.cart.findIndex(i => i.cartKey === cartKey);
  if (itemIndex > -1) {
    appState.cart[itemIndex].quantity += delta;
    if (appState.cart[itemIndex].quantity <= 0) {
      appState.cart.splice(itemIndex, 1);
      showToast("تم حذف المنتج من السلة", "info");
    }
    saveCartToStorage();
    updateCartUI();
  }
}

function removeCartItem(cartKey) {
  appState.cart = appState.cart.filter(i => i.cartKey !== cartKey);
  saveCartToStorage();
  updateCartUI();
  showToast("تم حذف المنتج من السلة", "info");
}

function applyCouponCode(code) {
  const cleanCode = code.trim().toUpperCase();

  // التحقق من كود المستخدم الفردي
  if (appState.currentUser && appState.currentUser.couponCode === cleanCode) {
    if (appState.currentUser.couponUsed) {
      showToast("عذراً، هذا الكود تم استخدامه بالفعل مسبقاً! كل حساب له استخدام لمرة واحدة فقط.", "error");
      return;
    }
    appState.appliedCoupon = cleanCode;
    saveCartToStorage();
    updateCartUI();
    showToast(`تم تطبيق خصم 10% الخاص بحسابك بنجاح! 🎉 (${cleanCode})`, "success");
    const input = document.getElementById("couponInput");
    if (input) input.value = cleanCode;
    return;
  }

  // التحقق من الكوبون الافتراضي العام إذا لم يكن مسجلاً
  if (cleanCode === SHATHA_CONFIG.defaultCoupon) {
    appState.appliedCoupon = cleanCode;
    saveCartToStorage();
    updateCartUI();
    showToast(`تم تطبيق خصم 10% بنجاح! كود: ${cleanCode}`, "success");
    const input = document.getElementById("couponInput");
    if (input) input.value = cleanCode;
    return;
  }

  showToast("عذراً، كود الخصم غير صالح أو غير مرتبط بحسابك", "error");
}

/**
 * طلب منتج فردي محدد من داخل السلة:
 * توجيه العميل لصفحة checkout.html لملء بيانات التواصل ومكان التوصيل الإلزامية أولاً قبل إرسال الفاتورة للواتساب
 */
function orderSingleCartItemViaWhatsapp(cartKey) {
  const item = appState.cart.find(i => i.cartKey === cartKey);
  if (!item) return;

  showToast("يرجى ملء بيانات التواصل ومكان التوصيل أولاً لتجهيز فاتورة طلبك للواتساب", "info");
  closeCartDrawer();
  setTimeout(() => {
    window.location.href = "checkout.html";
  }, 400);
}

/**
 * إرسال كامل السلة عبر واتساب:
 * توجيه العميل لصفحة checkout.html لملء بيانات التواصل ومكان التوصيل الإلزامية أولاً
 */
function sendFullCartDirectToWhatsapp() {
  if (appState.cart.length === 0) {
    showToast("سلتك فارغة حالياً!", "error");
    return;
  }

  showToast("جاري توجيهك لصفحة كتابة بيانات التواصل والتوصيل لتأكيد الطلب عبر الواتساب", "info");
  closeCartDrawer();
  setTimeout(() => {
    window.location.href = "checkout.html";
  }, 400);
}

// تحديث واجهة السلة (UI)
function updateCartUI() {
  const badge = document.getElementById("cartCountBadge");
  const totalCount = appState.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (badge) {
    badge.innerText = totalCount;
  }

  const itemsContainer = document.getElementById("cartDrawerItems");
  const emptyState = document.getElementById("cartEmptyState");
  const subtotalElem = document.getElementById("cartSubtotalVal");
  const discountRow = document.getElementById("cartDiscountRow");
  const discountElem = document.getElementById("cartDiscountVal");
  const totalElem = document.getElementById("cartTotalVal");
  const freeMeterFill = document.getElementById("freeShippingMeterFill");
  const freeMeterText = document.getElementById("freeShippingMeterText");

  if (!itemsContainer) return;

  if (appState.cart.length === 0) {
    itemsContainer.style.display = "none";
    if (emptyState) emptyState.style.display = "block";
    if (subtotalElem) subtotalElem.innerText = `0 ${SHATHA_CONFIG.currency}`;
    if (discountRow) discountRow.style.display = "none";
    if (totalElem) totalElem.innerText = `0 ${SHATHA_CONFIG.currency}`;
    if (freeMeterFill) freeMeterFill.style.width = "0%";
    if (freeMeterText) freeMeterText.innerText = `أضيفي بـ ${SHATHA_CONFIG.freeShippingThreshold} ج.م للتوصيل المجاني`;
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  itemsContainer.style.display = "flex";

  // رسم قائمة عناصر السلة مع زر طلب مخصص للواتساب لكل منتج
  itemsContainer.innerHTML = appState.cart.map(item => `
    <div class="cart-item-card">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <div class="cart-item-variant">${item.sizeName}</div>
        <div class="cart-item-price">${item.price * item.quantity} ${SHATHA_CONFIG.currency}</div>
        
        <div style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin-top: 6px;">
          <div class="cart-qty-controls">
            <button class="qty-btn" onclick="updateCartItemQuantity('${item.cartKey}', -1)">-</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" onclick="updateCartItemQuantity('${item.cartKey}', 1)">+</button>
          </div>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeCartItem('${item.cartKey}')" title="حذف">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  `).join('');

  // الحسابات
  const subtotal = appState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  let discount = 0;

  if (appState.appliedCoupon) {
    discount = Math.round(subtotal * (SHATHA_CONFIG.discountPercent / 100));
    if (discountRow) discountRow.style.display = "flex";
    if (discountElem) discountElem.innerText = `- ${discount} ${SHATHA_CONFIG.currency} (${SHATHA_CONFIG.discountPercent}%)`;
  } else {
    if (discountRow) discountRow.style.display = "none";
  }

  const finalTotal = Math.max(0, subtotal - discount);

  if (subtotalElem) subtotalElem.innerText = `${subtotal} ${SHATHA_CONFIG.currency}`;
  if (totalElem) totalElem.innerText = `${finalTotal} ${SHATHA_CONFIG.currency}`;

  // شريط الشحن المجاني
  if (freeMeterFill && freeMeterText) {
    const percent = Math.min(100, Math.round((subtotal / SHATHA_CONFIG.freeShippingThreshold) * 100));
    freeMeterFill.style.width = `${percent}%`;
    if (subtotal >= SHATHA_CONFIG.freeShippingThreshold) {
      freeMeterText.innerHTML = `🎉 مبروك! حصلتِ على توصيل مجاني لباقاتك!`;
      freeMeterFill.style.background = "#27AE60";
    } else {
      const remaining = SHATHA_CONFIG.freeShippingThreshold - subtotal;
      freeMeterText.innerHTML = `أضيفي بـ <strong>${remaining} ${SHATHA_CONFIG.currency}</strong> إضافية للشحن المجاني!`;
      freeMeterFill.style.background = "linear-gradient(90deg, var(--primary-pink), #25D366)";
    }
  }
}

function openCartDrawer() {
  closeAllModals();
  const drawer = document.getElementById("cartDrawer");
  const backdrop = document.getElementById("modalBackdrop");
  drawer?.classList.add("active");
  backdrop?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  drawer?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function setupShippingDropdown() {
  const select = document.getElementById("checkoutGovernorate");
  if (!select) return;

  const optionsHtml = appState.shippingZones.map(zone => `
    <option value="${zone.id}" ${zone.id === appState.selectedShippingZone ? 'selected' : ''}>
      ${zone.name} - ${zone.price} ج.م
    </option>
  `).join('') + `
    <option value="custom">✏️ أخرى (كتابة اسم المحافظة يدوياً)</option>
  `;

  select.innerHTML = optionsHtml;

  select.addEventListener("change", (e) => {
    const manualWrap = document.getElementById("manualGovWrapper");
    if (e.target.value === "custom") {
      if (manualWrap) manualWrap.style.display = "block";
      const customInput = document.getElementById("customGovInput");
      customInput?.focus();
      let customZone = appState.shippingZones.find(z => z.id === "custom");
      if (!customZone) {
        customZone = { id: "custom", name: customInput?.value.trim() || "محافظة أخرى", price: 60 };
        appState.shippingZones.push(customZone);
      }
      appState.selectedShippingZone = "custom";
      updateCheckoutSummary();
    } else {
      if (manualWrap) manualWrap.style.display = "none";
      appState.selectedShippingZone = e.target.value;
      updateCheckoutSummary();
    }
  });

  const customInput = document.getElementById("customGovInput");
  customInput?.addEventListener("input", (e) => {
    const val = e.target.value.trim() || "محافظة أخرى";
    let customZone = appState.shippingZones.find(z => z.id === "custom");
    if (!customZone) {
      customZone = { id: "custom", name: val, price: 60 };
      appState.shippingZones.push(customZone);
    } else {
      customZone.name = val;
    }
    appState.selectedShippingZone = "custom";
    updateCheckoutSummary();
  });
}

function openCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  const backdrop = document.getElementById("modalBackdrop");
  updateCheckoutSummary();
  backdrop?.classList.add("active");
  modal?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  modal?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function updateCheckoutSummary() {
  const subtotal = appState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = appState.appliedCoupon ? Math.round(subtotal * (SHATHA_CONFIG.discountPercent / 100)) : 0;
  
  const currentZone = appState.shippingZones.find(z => z.id === appState.selectedShippingZone) || appState.shippingZones[0];
  const isFreeShipping = subtotal >= SHATHA_CONFIG.freeShippingThreshold;
  const shippingCost = isFreeShipping ? 0 : currentZone.price;
  const total = subtotal - discount + shippingCost;

  const summaryContainer = document.getElementById("checkoutOrderSummaryBox");
  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem;">
        <span>إجمالي الباقات المختارة (${appState.cart.length}):</span>
        <strong>${subtotal} ${SHATHA_CONFIG.currency}</strong>
      </div>
      ${discount > 0 ? `
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem; color: #27AE60;">
        <span>خصم كوبون (${appState.appliedCoupon}):</span>
        <strong>- ${discount} ${SHATHA_CONFIG.currency}</strong>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.9rem;">
        <span>تكلفة التوصيل (${currentZone.name.split('(')[0]}):</span>
        <strong>${isFreeShipping ? '<span style="color: #27AE60;">مجاني 🎉</span>' : `${shippingCost} ${SHATHA_CONFIG.currency}`}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #D5C2C4; font-size: 1.15rem; font-weight: 900; color: var(--primary-dark);">
        <span>المبلغ الإجمالي للدفع:</span>
        <span>${total} ${SHATHA_CONFIG.currency}</span>
      </div>
    `;
  }
}

// معالجة وإرسال الطلب عبر واتساب مع كامل البيانات
function handleCheckoutSubmit(e) {
  e?.preventDefault();

  const customerName = document.getElementById("checkoutName")?.value.trim();
  const customerPhone = document.getElementById("checkoutPhone")?.value.trim();
  const customerAddress = document.getElementById("checkoutAddress")?.value.trim();
  const deliveryDate = document.getElementById("checkoutDate")?.value || document.getElementById("cDeliveryDate")?.value || "في أسرع وقت";
  const deliveryUrgency = document.querySelector('input[name="checkoutUrgency"]:checked')?.value || document.querySelector('input[name="deliveryUrgency"]:checked')?.value || "standard";
  const deliveryReason = document.getElementById("checkoutDeliveryReason")?.value?.trim() || document.getElementById("cDeliveryReason")?.value?.trim() || "";
  const notes = document.getElementById("checkoutNotes")?.value.trim() || "لا توجد ملاحظات إضافية";

  const giftSender = document.getElementById("checkoutGiftSender")?.value.trim();
  const giftRecipient = document.getElementById("checkoutGiftRecipient")?.value.trim();
  const giftMessage = document.getElementById("checkoutGiftMessage")?.value.trim();

  if (!customerName || !customerPhone || !customerAddress) {
    showToast("يرجى إدخال الاسم ورقم هاتف الواتساب والعنوان بالتفصيل", "error");
    return;
  }

  const subtotal = appState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = appState.appliedCoupon ? Math.round(subtotal * (SHATHA_CONFIG.discountPercent / 100)) : 0;
  const currentZone = appState.shippingZones.find(z => z.id === appState.selectedShippingZone) || appState.shippingZones[0];
  const isFreeShipping = subtotal >= SHATHA_CONFIG.freeShippingThreshold;
  const shippingCost = isFreeShipping ? 0 : currentZone.price;
  const grandTotal = subtotal - discount + shippingCost;

  const paymentNames = {
    vodafone: "فودافون كاش / محافظ إلكترونية (01152998910 أو 01002398698)",
    instapay: "إنستاباي InstaPay"
  };
  const paymentMethodLabel = paymentNames[appState.selectedPaymentMethod] || "فودافون كاش / محافظ إلكترونية";

  const urgencyLabel = deliveryUrgency === "urgent" ? "⚡ مستعجل (تسليم سريع/نفس اليوم)" : "🌸 عادي (الموعد المحدد)";

  let orderMsg = `🌸 *طلب جديد من متجر شذى للهدايا والورد المصنوع (SHATHA)* 🌸\n`;
  orderMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
  orderMsg += `👤 *بيانات العميل:*\n`;
  orderMsg += `• الاسم: ${customerName}\n`;
  orderMsg += `• رقم الهاتف: ${customerPhone}\n`;
  orderMsg += `• العنوان: ${customerAddress}\n`;
  orderMsg += `• المحافظة/المنطقة: ${currentZone.name}\n`;
  orderMsg += `• موعد التوصيل المطلوب: ${deliveryDate}\n`;
  orderMsg += `• نوع التوصيل: ${urgencyLabel}\n`;
  if (deliveryReason) {
    orderMsg += `• تفاصيل الموعد / سبب الاستعجال: ${deliveryReason}\n`;
  }
  orderMsg += `\n`;

  orderMsg += `💐 *المنتجات والباقات المطلوبة:*\n`;
  appState.cart.forEach((item, index) => {
    orderMsg += `${index + 1}. *${item.name}*\n   - المقاس/التنسيق: ${item.sizeName}\n   - العدد: ${item.quantity}\n   - السعر: ${item.price * item.quantity} ج.م\n`;
  });
  orderMsg += `\n`;

  if (giftMessage || giftSender || giftRecipient) {
    orderMsg += `💌 *كارت الإهداء المجاني:*\n`;
    if (giftSender) orderMsg += `• من: ${giftSender}\n`;
    if (giftRecipient) orderMsg += `• إلى: ${giftRecipient}\n`;
    if (giftMessage) orderMsg += `• نص الإهداء: "${giftMessage}"\n\n`;
  }

  orderMsg += `💰 *تفاصيل الفاتورة:*\n`;
  orderMsg += `• المجموع: ${subtotal} ج.م\n`;
  if (discount > 0) {
    orderMsg += `• خصم كوبون (${appState.appliedCoupon}): -${discount} ج.م\n`;
  }
  orderMsg += `• الشحن: ${isFreeShipping ? 'مجاني 🎉' : `${shippingCost} ج.م`}\n`;
  orderMsg += `• *الإجمالي النهائي: ${grandTotal} ج.م*\n`;
  orderMsg += `• طريقة الدفع: ${paymentMethodLabel}\n`;
  if (notes && notes !== "لا توجد ملاحظات إضافية") {
    orderMsg += `• ملاحظات: ${notes}\n`;
  }
  orderMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
  orderMsg += `شذى.. إبداع يدوي يخلّد أجمل الذكريات ✨`;

  const orderReceipt = {
    orderId: "SH-" + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toLocaleDateString('ar-EG'),
    customerName,
    grandTotal,
    items: [...appState.cart]
  };

  // تعليم كود الخصم الفردي كمستخدم لمرة واحدة فقط
  if (appState.currentUser && appState.appliedCoupon === appState.currentUser.couponCode) {
    localStorage.setItem(`shatha_coupon_used_${appState.currentUser.id}`, 'true');
    appState.currentUser.couponUsed = true;
    localStorage.setItem('shatha_google_user', JSON.stringify(appState.currentUser));
    updateAuthUI();
  }

  appState.cart = [];
  appState.appliedCoupon = null;
  localStorage.removeItem('shatha_applied_coupon');
  saveCartToStorage();
  updateCartUI();

  closeCheckoutModal();

  const waUrl = `https://wa.me/${SHATHA_CONFIG.whatsappNumber}?text=${encodeURIComponent(orderMsg)}`;
  window.open(waUrl, '_blank');

  openSuccessModal(orderReceipt);
}

function openSuccessModal(order) {
  const modal = document.getElementById("successModal");
  const backdrop = document.getElementById("modalBackdrop");
  
  const idElem = document.getElementById("successOrderId");
  if (idElem) idElem.innerText = order.orderId;

  backdrop?.classList.add("active");
  modal?.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSuccessModal() {
  const modal = document.getElementById("successModal");
  modal?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function openPolicyModal(policyType) {
  closeAllModals();
  const modal = document.getElementById(`policyModal-${policyType}`);
  const backdrop = document.getElementById("modalBackdrop");
  if (modal) {
    modal.classList.add("active");
    backdrop?.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closePolicyModal(policyType) {
  const modal = document.getElementById(`policyModal-${policyType}`);
  modal?.classList.remove("active");
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function closeAllModals() {
  closeCartDrawer();
  closeProductModal();
  closeCheckoutModal();
  closeSuccessModal();
  document.querySelectorAll(".policy-modal").forEach(m => m.classList.remove("active"));
  document.getElementById("modalBackdrop")?.classList.remove("active");
  document.body.style.overflow = "";
}

function showToast(message, type = "info") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "fa-info-circle";
  if (type === "success") icon = "fa-check-circle";
  if (type === "error") icon = "fa-exclamation-triangle";

  toast.innerHTML = `
    <i class="fas ${icon}" style="color: ${type === 'success' ? '#27AE60' : type === 'error' ? '#E74C3C' : 'var(--primary-pink)'}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/* ==========================================================================
   Google Sign-In & Individual Discount Coupon Engine
   نظام تسجيل الدخول بحساب Google وتوليد كود خصم فردي 10% لكل حساب (استخدام لمرة واحدة)
   ========================================================================== */

/**
 * تحميل المستخدم المخزن محلياً
 */
function loadCurrentUser() {
  try {
    const saved = localStorage.getItem('shatha_google_user');
    if (saved) {
      const user = JSON.parse(saved);
      // فحص حالة استهلاك الكود من سجل الأكواد المستهلكة
      const usedStatus = localStorage.getItem(`shatha_coupon_used_${user.id}`) === 'true';
      user.couponUsed = usedStatus;
      appState.currentUser = user;
    }
  } catch (e) {
    console.warn("Error loading user:", e);
  }
}

/**
 * تهيئة Google Identity Services وزر تسجيل الدخول
 */
function initGoogleSignIn() {
  updateAuthUI();

  // فحص توفر مكتبة Google
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    // محاولة ثانية بعد تحميل السكربت
    setTimeout(initGoogleSignIn, 600);
    return;
  }

  try {
    google.accounts.id.initialize({
      client_id: SHATHA_CONFIG.googleClientId,
      callback: handleGoogleSignInResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    const btnContainer = document.getElementById("googleSignInBtnTop");
    if (btnContainer && !appState.currentUser) {
      btnContainer.innerHTML = "";
      google.accounts.id.renderButton(btnContainer, {
        theme: "outline",
        size: "medium",
        type: "standard",
        text: "signin_with",
        shape: "pill",
        logo_alignment: "right"
      });
    }

    const newsletterBtn = document.getElementById("googleSignInBtnNewsletter");
    if (newsletterBtn && !appState.currentUser) {
      newsletterBtn.innerHTML = "";
      google.accounts.id.renderButton(newsletterBtn, {
        theme: "filled_blue",
        size: "large",
        type: "standard",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "right"
      });
    }
  } catch (e) {
    console.error("Google Sign-In Init Error:", e);
  }

  // إعداد نقر الملف الشخصي لفتح وإغلاق القائمة المنسدلة
  const profileBtn = document.getElementById("userProfileBtn");
  const dropdown = document.getElementById("userDropdownMenu");
  profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!profileBtn?.contains(e.target) && !dropdown?.contains(e.target)) {
      dropdown?.classList.remove("show");
    }
  });
}

/**
 * معالجة استجابة تسجيل الدخول بجوجل
 */
function handleGoogleSignInResponse(response) {
  try {
    const payload = parseJwt(response.credential);
    if (!payload || !payload.sub) {
      showToast("حدث خطأ أثناء قراءة بيانات الحساب", "error");
      return;
    }

    const googleId = payload.sub;
    const name = payload.name || "عميل شذى";
    const email = payload.email || "";
    const picture = payload.picture || "assets/images/logo.jpg";

    // توليد كود خصم فردي فريد مشتق من Google ID
    const uniqueCoupon = generateUniqueCouponForUser(googleId);
    const isUsed = localStorage.getItem(`shatha_coupon_used_${googleId}`) === 'true';

    const userData = {
      id: googleId,
      name: name,
      email: email,
      picture: picture,
      couponCode: uniqueCoupon,
      couponUsed: isUsed
    };

    appState.currentUser = userData;
    localStorage.setItem('shatha_google_user', JSON.stringify(userData));

    updateAuthUI();

    showToast(`مرحباً بك يا ${name}! حصلت على كود خصم 10% لطلبك 🌸`, "success");

    // تطبيق الكود تلقائياً إذا لم يكن مستخدماً من قبل
    if (!isUsed) {
      applyCouponCode(uniqueCoupon);
    }
  } catch (err) {
    console.error("JWT Decode Error:", err);
    showToast("تعذر إتمام تسجيل الدخول بحساب Google", "error");
  }
}

/**
 * فك تشفير JWT الخاص بجوجل لاستخراج الاسم والـ ID والصورة
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

/**
 * توليد كود خصم فريد 10% لكل حساب جوجل
 */
function generateUniqueCouponForUser(googleId) {
  // استخدام جزء من الـ hash للـ ID لإنشاء كود مميز ومختصر
  let hash = 0;
  for (let i = 0; i < googleId.length; i++) {
    hash = ((hash << 5) - hash) + googleId.charCodeAt(i);
    hash |= 0;
  }
  const codeSuffix = Math.abs(hash).toString(36).toUpperCase().padStart(5, '0').slice(0, 5);
  return `SHATHA-${codeSuffix}`;
}

/**
 * تحديث واجهة المستخدم بعد تسجيل الدخول أو الخروج
 */
function updateAuthUI() {
  const loggedOutBar = document.getElementById("authBarLoggedOut");
  const loggedInBar = document.getElementById("authBarLoggedIn");
  const userWidget = document.getElementById("userAuthWidget");
  const newsletterBtn = document.getElementById("googleSignInBtnNewsletter");

  if (appState.currentUser) {
    const user = appState.currentUser;
    const isUsed = localStorage.getItem(`shatha_coupon_used_${user.id}`) === 'true';
    user.couponUsed = isUsed;

    if (loggedOutBar) loggedOutBar.style.display = "none";
    if (loggedInBar) loggedInBar.style.display = "flex";
    if (newsletterBtn) newsletterBtn.style.display = "none";

    const nameElem = document.getElementById("loggedInUserName");
    const codeElem = document.getElementById("userCouponCode");
    const statusBadge = document.getElementById("couponStatusBadge");

    if (nameElem) nameElem.innerText = user.name.split(' ')[0];
    if (codeElem) codeElem.innerText = user.couponCode;

    if (statusBadge) {
      if (isUsed) {
        statusBadge.innerText = "تم استخدام الكود سابقاً";
        statusBadge.classList.add("used");
      } else {
        statusBadge.innerText = "متاح للاستخدام (مرة واحدة)";
        statusBadge.classList.remove("used");
      }
    }

    // عنصر الهيدر
    if (userWidget) {
      userWidget.style.display = "block";
      const avatar = document.getElementById("userAvatarImg");
      const shortName = document.getElementById("userNameShort");
      const fullName = document.getElementById("dropdownFullName");
      const email = document.getElementById("dropdownEmail");
      const dropCode = document.getElementById("dropdownCouponVal");
      const dropStatus = document.getElementById("dropdownCouponStatus");

      if (avatar) avatar.src = user.picture;
      if (shortName) shortName.innerText = user.name.split(' ')[0];
      if (fullName) fullName.innerText = user.name;
      if (email) email.innerText = user.email;
      if (dropCode) dropCode.innerText = user.couponCode;

      if (dropStatus) {
        if (isUsed) {
          dropStatus.innerText = "تم استهلاك الكود";
          dropStatus.style.color = "#E74C3C";
        } else {
          dropStatus.innerText = "متاح للاستخدام (مرة واحدة)";
          dropStatus.style.color = "#27AE60";
        }
      }
    }

    // التحقق الصارم من مالك المتجر: a4999360@gmail.com
    const isOwner = user.email && user.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim();
    const navAdmin = document.getElementById("navAdminLink");
    const sectionAddBtn = document.getElementById("sectionAdminAddBtn");
    const footerAdmin = document.getElementById("footerAdminLink");

    if (navAdmin) navAdmin.style.display = isOwner ? "block" : "none";
    if (sectionAddBtn) sectionAddBtn.style.display = isOwner ? "inline-flex" : "none";
    if (footerAdmin) footerAdmin.style.display = isOwner ? "block" : "none";

    // إضافة شارة مالك المتجر للملف الشخصي
    if (isOwner) {
      const dropdownInfo = document.querySelector(".dropdown-user-info");
      if (dropdownInfo && !document.getElementById("ownerBadgeTag")) {
        const badge = document.createElement("span");
        badge.id = "ownerBadgeTag";
        badge.style = "background: #27AE60; color: #fff; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; margin-top: 4px; display: inline-block;";
        badge.innerHTML = '<i class="fas fa-crown"></i> مالك المتجر والمدير';
        dropdownInfo.appendChild(badge);
      }
    }
  } else {
    // حالة عدم تسجيل الدخول: إخفاء كافة أدوات الإدارة
    const navAdmin = document.getElementById("navAdminLink");
    const sectionAddBtn = document.getElementById("sectionAdminAddBtn");
    const footerAdmin = document.getElementById("footerAdminLink");
    if (navAdmin) navAdmin.style.display = "none";
    if (sectionAddBtn) sectionAddBtn.style.display = "none";
    if (footerAdmin) footerAdmin.style.display = "none";

    if (loggedOutBar) loggedOutBar.style.display = "flex";
    if (loggedInBar) loggedInBar.style.display = "none";
    if (userWidget) userWidget.style.display = "none";

    if (newsletterBtn) {
      newsletterBtn.style.display = "flex";
    }

    // إعادة رسم أزرار جوجل
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      const btnContainer = document.getElementById("googleSignInBtnTop");
      if (btnContainer) {
        btnContainer.innerHTML = "";
        google.accounts.id.renderButton(btnContainer, {
          theme: "outline",
          size: "medium",
          type: "standard",
          text: "signin_with",
          shape: "pill",
          logo_alignment: "right"
        });
      }

      if (newsletterBtn) {
        newsletterBtn.innerHTML = "";
        google.accounts.id.renderButton(newsletterBtn, {
          theme: "filled_blue",
          size: "large",
          type: "standard",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "right"
        });
      }
    }
  }

  // تحديث أدوات المالك فوراً على كروت المنتجات
  renderProducts();
}

/**
 * نسخ كود الخصم الخاص بالمستخدم وتطبيقه
 */
function copyMyCoupon() {
  if (!appState.currentUser) {
    showToast("يرجى تسجيل الدخول بحساب Google أولاً للحصول على كود الخصم", "info");
    return;
  }

  const user = appState.currentUser;
  const isUsed = localStorage.getItem(`shatha_coupon_used_${user.id}`) === 'true';

  if (isUsed) {
    showToast("كود الخصم هذا تم استخدامه بالفعل مسبقاً! كل حساب له كود يعمل لمرة واحدة فقط.", "error");
    return;
  }

  navigator.clipboard?.writeText(user.couponCode);
  showToast(`تم نسخ كود خصمك (${user.couponCode}) وتطبيقه تلقائياً! 🎉`, "success");
  applyCouponCode(user.couponCode);
}

/**
 * تسجيل الخروج
 */
function handleGoogleSignOut() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }

  appState.currentUser = null;
  localStorage.removeItem('shatha_google_user');
  
  // إلغاء الكوبون الحالي إذا كان كوبون المستخدم المسجل
  appState.appliedCoupon = null;
  localStorage.removeItem('shatha_applied_coupon');
  
  const dropdown = document.getElementById("userDropdownMenu");
  dropdown?.classList.remove("show");

  updateAuthUI();
  updateCartUI();

  showToast("تم تسجيل الخروج بنجاح", "info");
}

/* ==========================================================================
   نظام إضافة المنتجات الذكي والمباشر لشذى (In-Page Product Wizard)
   يتيح للمستخدم رفع الصور وإدخال الأسعار والأحجام والخامات دون تعديل الكود
   ========================================================================== */

let wizardCurrentStep = 1;
let wizardImages = [];

function openAddProductModal() {
  const user = appState.currentUser;
  const isOwner = user && user.email && user.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim();

  if (!isOwner) {
    showToast("عذراً، هذه اللوحة مخصصة فقط لمالك المتجر شذى (" + SHATHA_CONFIG.ownerEmail + ") بعد تسجيل الدخول.", "error");
    return;
  }

  const modal = document.getElementById("addProductModal");
  const backdrop = document.getElementById("modalBackdrop");
  if (!modal) return;

  // إعادة ضبط وضع الإضافة
  const editInput = document.getElementById("editingProductId");
  if (editInput) editInput.value = "";

  const modalTitle = document.getElementById("wizardModalTitle");
  const modalIcon = document.getElementById("wizardModalIcon");
  const submitBtnText = document.getElementById("wizardSubmitBtnText");

  if (modalTitle) modalTitle.innerText = "نظام إضافة منتج وباقة جديدة لشذى";
  if (modalIcon) modalIcon.className = "fas fa-plus-circle";
  if (submitBtnText) submitBtnText.innerText = "حفظ ونشر الباقة فوراً";

  document.getElementById("wizardProductForm")?.reset();

  wizardImages = [];
  renderWizardImages();
  initWizardSizes();
  switchWizardStep(1);

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

// فتح نافذة تعديل باقة قائمة للمالك
function openEditProductModal(productId) {
  const user = appState.currentUser;
  const isOwner = user && user.email && user.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim();

  if (!isOwner) {
    showToast("عذراً، التعديل متاح فقط لمالك المتجر شذى بعد تسجيل الدخول.", "error");
    return;
  }

  const product = appState.products.find(p => p.id === productId);
  if (!product) {
    showToast("لم يتم العثور على الباقة المطلوبة", "error");
    return;
  }

  const modal = document.getElementById("addProductModal");
  const backdrop = document.getElementById("modalBackdrop");
  if (!modal) return;

  // وضع معرّف المنتج قيد التعديل
  const editInput = document.getElementById("editingProductId");
  if (editInput) editInput.value = product.id;

  // تحديث النصوص والعناوين
  const modalTitle = document.getElementById("wizardModalTitle");
  const modalIcon = document.getElementById("wizardModalIcon");
  const submitBtnText = document.getElementById("wizardSubmitBtnText");

  if (modalTitle) modalTitle.innerText = `تعديل باقة: ${product.name}`;
  if (modalIcon) modalIcon.className = "fas fa-edit";
  if (submitBtnText) submitBtnText.innerText = "حفظ التعديلات على الباقة";

  // تعبئة بيانات الخطوة 1
  if (document.getElementById("wName")) document.getElementById("wName").value = product.name || "";
  if (document.getElementById("wBasePrice")) document.getElementById("wBasePrice").value = product.basePrice || "";
  if (document.getElementById("wOldPrice")) document.getElementById("wOldPrice").value = product.oldPrice || "";
  if (document.getElementById("wTag")) document.getElementById("wTag").value = product.tag || "";
  if (document.getElementById("wShortDesc")) document.getElementById("wShortDesc").value = product.shortDesc || "";

  // تعبئة بيانات الخطوة 2: الصور
  wizardImages = Array.isArray(product.images) ? [...product.images] : [];
  renderWizardImages();

  // تعبئة بيانات الخطوة 3: المقاسات
  const container = document.getElementById("wSizesContainer");
  if (container) {
    if (Array.isArray(product.sizes) && product.sizes.length > 0) {
      container.innerHTML = product.sizes.map(s => `
        <div class="wizard-size-row" style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;">
          <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="${s.name || ''}">
          <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="${s.price || ''}">
          <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="${s.stems || ''}">
          <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
        </div>
      `).join('');
    } else {
      initWizardSizes();
    }
  }

  // تعبئة بيانات الخطوة 4: الخامات والميزات
  if (document.getElementById("wMaterials")) document.getElementById("wMaterials").value = product.materials || "";
  if (document.getElementById("wCraft")) document.getElementById("wCraft").value = product.craftsmanship || "";
  if (document.getElementById("wAdvantages")) {
    document.getElementById("wAdvantages").value = Array.isArray(product.advantages) ? product.advantages.join('\n') : "";
  }

  switchWizardStep(1);

  backdrop?.classList.add("active");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

// حذف باقة نهائياً بواسطة المالك
function deleteProductById(productId) {
  const user = appState.currentUser;
  const isOwner = user && user.email && user.email.toLowerCase().trim() === SHATHA_CONFIG.ownerEmail.toLowerCase().trim();

  if (!isOwner) {
    showToast("عذراً، صلاحية الحذف متاحة فقط لمالك المتجر بعد تسجيل الدخول.", "error");
    return;
  }

  const product = appState.products.find(p => p.id === productId);
  if (!product) return;

  const confirmed = confirm(`هل أنت متأكد من رغبتك في حذف باقة "${product.name}" نهائياً من المتجر؟`);
  if (!confirmed) return;

  appState.products = appState.products.filter(p => p.id !== productId);
  saveAllProductsToStorage();

  closeProductModal();
  renderProducts();

  showToast(`تم حذف باقة "${product.name}" بنجاح 🗑️`, "info");
}

function closeAddProductModal() {
  const modal = document.getElementById("addProductModal");
  const backdrop = document.getElementById("modalBackdrop");
  modal?.classList.remove("active");
  backdrop?.classList.remove("active");
  document.body.style.overflow = "auto";
}

function switchWizardStep(step) {
  if (step === 2) {
    const name = document.getElementById("wName")?.value.trim();
    const price = document.getElementById("wBasePrice")?.value;
    const desc = document.getElementById("wShortDesc")?.value.trim();
    if (!name || !price || !desc) {
      showToast("يرجى ملء اسم المنتج وسعره والوصف أولاً للمتابعة", "error");
      return;
    }
  }

  if (step === 3 && wizardImages.length === 0) {
    showToast("يرجى اختيار صورة واحدة على الأقل للباقة للمتابعة", "error");
    return;
  }

  wizardCurrentStep = step;

  for (let i = 1; i <= 4; i++) {
    const content = document.getElementById(`wizardStep${i}`);
    const tab = document.getElementById(`wizardTab${i}`);
    if (content) content.style.display = (i === step) ? "block" : "none";
    if (tab) {
      tab.style.background = (i === step) ? "var(--primary-soft)" : "transparent";
      tab.style.color = (i === step) ? "var(--primary-dark)" : "var(--text-muted)";
      const badge = tab.querySelector("span");
      if (badge) {
        badge.style.background = (i === step) ? "var(--primary-pink)" : "var(--border-subtle)";
        badge.style.color = (i === step) ? "#FFFFFF" : "var(--text-main)";
      }
    }
  }
}

// قراءة ملفات الصور المختارة من الجهاز
function handleWizardFiles(files) {
  if (!files || files.length === 0) return;

  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      wizardImages.push(e.target.result);
      renderWizardImages();
    };
    reader.readAsDataURL(file);
  });
}

// إضافة مسار يدوي من مجلد FLOURS
function addWizardManualPath() {
  const input = document.getElementById("wManualPath");
  const path = input?.value.trim();
  if (!path) {
    showToast("يرجى كتابة مسار الصورة أولاً", "error");
    return;
  }
  wizardImages.push(path);
  input.value = "";
  renderWizardImages();
  showToast("تمت إضافة مسار الصورة بنجاح!", "success");
}

function renderWizardImages() {
  const grid = document.getElementById("wImagesGrid");
  const counter = document.getElementById("wImagesCount");
  if (counter) counter.innerText = wizardImages.length;
  if (!grid) return;

  if (wizardImages.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 15px;">لم تقم باختيار أي صورة بعد</div>`;
    return;
  }

  grid.innerHTML = wizardImages.map((src, idx) => `
    <div style="position: relative; aspect-ratio: 1/1; border-radius: var(--radius-sm); overflow: hidden; border: 1.5px solid var(--border-subtle); box-shadow: var(--shadow-sm);">
      <img src="${src}" alt="صورة ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
      <button type="button" onclick="removeWizardImage(${idx})" style="position: absolute; top: 3px; left: 3px; background: rgba(231,76,60,0.85); color: #fff; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;" title="حذف الصورة">
        <i class="fas fa-times"></i>
      </button>
      <span style="position: absolute; bottom: 0; right: 0; left: 0; background: rgba(0,0,0,0.6); color: #fff; font-size: 0.65rem; text-align: center; padding: 2px 0;">
        ${idx === 0 ? 'الرئيسية' : 'زاوية ' + (idx + 1)}
      </span>
    </div>
  `).join('');
}

function removeWizardImage(index) {
  wizardImages.splice(index, 1);
  renderWizardImages();
}

// الأحجام الافتراضية
function initWizardSizes() {
  const container = document.getElementById("wSizesContainer");
  if (!container) return;

  const basePrice = document.getElementById("wBasePrice")?.value || 450;
  container.innerHTML = `
    <div class="wizard-size-row" style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;">
      <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="باقة كلاسيكية (15-18 زهرة)">
      <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="${basePrice}">
      <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="15-18 زهرة ستان هاندميد">
      <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
    </div>
    <div class="wizard-size-row" style="display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;">
      <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="باقة ديلوكس (25-30 زهرة)">
      <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="${Math.round(basePrice * 1.35)}">
      <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="25-30 زهرة ستان هاندميد">
      <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
    </div>
  `;
}

function addWizardSizeRow() {
  const container = document.getElementById("wSizesContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "wizard-size-row";
  row.style = "display: grid; grid-template-columns: 1.5fr 1fr 1fr 35px; gap: 8px; background: #fff; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); align-items: center;";
  row.innerHTML = `
    <input type="text" class="form-control wz-size-name" style="font-size: 0.85rem; padding: 8px;" placeholder="اسم المقاس" value="باقة ملكية ضخمة">
    <input type="number" class="form-control wz-size-price" style="font-size: 0.85rem; padding: 8px;" placeholder="السعر" value="">
    <input type="text" class="form-control wz-size-stems" style="font-size: 0.85rem; padding: 8px;" placeholder="التنسيق" value="تنسيق خاص VIP">
    <button type="button" onclick="this.closest('.wizard-size-row').remove()" style="color: #E74C3C; font-size: 0.9rem;" title="حذف المقاس"><i class="fas fa-trash"></i></button>
  `;
  container.appendChild(row);
}

// حفظ المنتج وإدراجه فوراً في المتجر
function handleWizardProductSubmit(e) {
  e.preventDefault();

  if (wizardImages.length === 0) {
    switchWizardStep(2);
    showToast("يرجى اختيار صورة واحدة على الأقل في الخطوة 2", "error");
    return;
  }

  const name = document.getElementById("wName").value.trim();
  const basePrice = parseFloat(document.getElementById("wBasePrice").value);
  const oldPrice = parseFloat(document.getElementById("wOldPrice")?.value) || null;
  const tag = document.getElementById("wTag")?.value.trim() || "شغل يدوي فاخر";
  const shortDesc = document.getElementById("wShortDesc").value.trim();
  const materials = document.getElementById("wMaterials")?.value.trim() || "أشرطة ستان حريري تركي فاخر عالي اللمعان، تغليف كوري سموكي أسود أنيق مقاوم للماء.";
  const craftsmanship = document.getElementById("wCraft")?.value.trim() || "صناعة يدوية متقنة 100% - طي وتشكيل بتلات الجوري بحرفية لتدوم للأبد دون أن تذبل.";

  const advText = document.getElementById("wAdvantages")?.value.trim();
  const advantages = advText ? advText.split('\n').map(l => l.trim()).filter(l => l.length > 0) : [
    "ورد ستان مصنوع يدوياً يدوم مدى الحياة ولا يذبل أبداً.",
    "لا يحتاج إلى ماء أو شمس أو أي عناية خاصة.",
    "كارت إهداء مطبوع مجاناً مع كل باقة."
  ];

  const sizeRows = document.querySelectorAll(".wizard-size-row");
  const sizes = [];
  sizeRows.forEach((row, i) => {
    const sName = row.querySelector(".wz-size-name")?.value.trim() || `مقاس ${i + 1}`;
    const sPrice = parseFloat(row.querySelector(".wz-size-price")?.value) || basePrice;
    const sStems = row.querySelector(".wz-size-stems")?.value.trim() || "تنسيق خاص";
    sizes.push({
      id: `wz_size_${i}_${Date.now()}`,
      name: sName,
      price: sPrice,
      stems: sStems,
      sizeLabel: "مقاس قياسي",
      desc: "صناعة يدوية متقنة بتنسيق شذى"
    });
  });

  if (sizes.length === 0) {
    sizes.push({
      id: `wz_size_default_${Date.now()}`,
      name: "باقة قياسية",
      price: basePrice,
      stems: "تنسيق يدوي",
      sizeLabel: "قياسي",
      desc: "صناعة يدوية متقنة بتنسيق شذى"
    });
  }

  const editingId = document.getElementById("editingProductId")?.value;

  if (editingId) {
    try {
      const prodIndex = appState.products.findIndex(p => p.id === editingId);
      if (prodIndex > -1) {
        const existing = appState.products[prodIndex];
        existing.name = name;
        existing.basePrice = basePrice;
        existing.oldPrice = oldPrice;
        existing.tag = tag;
        existing.shortDesc = shortDesc;
        existing.images = [...wizardImages];
        existing.materials = materials;
        existing.craftsmanship = craftsmanship;
        existing.sizes = sizes;
        existing.advantages = advantages;

        saveAllProductsToStorage();
        renderProducts();

        // إذا كانت نافذة تفاصيل المنتج مفتوحة، نقوم بتحديثها فوراً
        if (document.getElementById("productDetailsModal")?.classList.contains("active") && appState.selectedProduct?.id === editingId) {
          openProductModal(editingId);
        }

        closeAddProductModal();
        showToast(`🎉 تم حفظ تعديلات باقة "${existing.name}" بنجاح!`, "success");
        return;
      }
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ أثناء حفظ تعديلات الباقة", "error");
      return;
    }
  }

  const newProduct = {
    id: "custom_" + Date.now(),
    name: name,
    slug: "shatha-custom-" + Date.now(),
    tag: tag,
    isBestSeller: true,
    basePrice: basePrice,
    oldPrice: oldPrice,
    rating: 5.0,
    reviewsCount: 1,
    stock: "متوفر حسب الطلب (صناعة يدوية خاصة)",
    inStock: true,
    shortDesc: shortDesc,
    images: wizardImages,
    materials: materials,
    craftsmanship: craftsmanship,
    sizes: sizes,
    advantages: advantages,
    reviews: [
      { author: "عميل شذى", rating: 5, date: "الآن", comment: "منتج رائع ومتقن للغاية!" }
    ],
    isCustom: true
  };

  try {
    appState.products.unshift(newProduct);
    saveAllProductsToStorage();

    // تحديث حالة المنتجات مباشرة في الصفحة دون الحاجة لإعادة التحميل
    renderProducts();

    closeAddProductModal();
    showToast(`🎉 تم نشر باقة "${newProduct.name}" بنجاح على الموقع وتظهر الآن في المقدمة!`, "success");

    // التمرير التلقائي لقسم المنتجات لرؤية المنتج الجديد
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء حفظ المنتج، جرب استخدام صور أصغر حجماً", "error");
  }
}

/* ==========================================================================
   إدارة تطبيق الهاتف وتثبيت الـ PWA (Install Mobile Web App)
   ========================================================================== */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // منع المتصفح من إظهار النافذة الافتراضية القديمة
  e.preventDefault();
  deferredPrompt = e;

  // إظهار شريط تثبيت تطبيق شذى الأنيق
  const banner = document.getElementById("pwaInstallBanner");
  if (banner && !sessionStorage.getItem('shatha_pwa_dismissed')) {
    banner.style.display = "flex";
  }
});

document.getElementById("btnPwaInstall")?.addEventListener("click", async () => {
  const banner = document.getElementById("pwaInstallBanner");
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast("شكراً لك! تم تثبيت تطبيق شذى على شاشة هاتفك بنجاح 🌸", "success");
    }
    deferredPrompt = null;
    if (banner) banner.style.display = "none";
  } else {
    // لهواتف آيفون (iOS Safari)
    showToast("لتثبيت التطبيق على الآيفون: اضغط على زر المشاركة (Share) بالأسفل ثم اختر 'إضافة إلى الشاشة الرئيسية (Add to Home Screen)'", "info");
  }
});

document.getElementById("btnPwaDismiss")?.addEventListener("click", () => {
  const banner = document.getElementById("pwaInstallBanner");
  if (banner) banner.style.display = "none";
  sessionStorage.setItem('shatha_pwa_dismissed', 'true');
});

// تسجيل الـ Service Worker لتمكين عمل الموقع كتطبيق موبايل
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      // صامت في بيئة التطوير المحلية
      console.log('SW registration note:', err);
    });
  });
}

/* ==========================================================================
   إدارة الوضع الليلي والفاتح (Dark / Light Mode)
   متجر شَـذى - أيقونة تفاعلية متناسقة مع ألوان وهوية الموقع
   ========================================================================== */
const SHATHA_THEME_KEY = 'shatha_theme';

function getShathaTheme() {
  try {
    const saved = localStorage.getItem(SHATHA_THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) {}
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function updateThemeUI(theme) {
  const isDark = theme === 'dark';
  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  
  toggleBtns.forEach(btn => {
    const title = isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الليلي';
    btn.setAttribute('aria-label', title);
    btn.setAttribute('title', title);
    
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
      icon.classList.remove('theme-icon-rotate');
      void icon.offsetWidth; // إعادة تشغيل الأنيميشن
      icon.classList.add('theme-icon-rotate');
    }
  });

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#140E10' : '#BF7279');
  }
}

function applyShathaTheme(theme, animate = false, notify = false) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-transitioning');
    window.clearTimeout(window.__themeTimeout);
    window.__themeTimeout = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 450);
  }

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }

  updateThemeUI(theme);

  if (notify && typeof showToast === 'function') {
    if (theme === 'dark') {
      showToast('تم تفعيل الوضع الليلي الفاخر 🌙', 'info');
    } else {
      showToast('تم تفعيل الوضع الفاتح الأنيق ☀️', 'info');
    }
  }
}

window.toggleTheme = function () {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(SHATHA_THEME_KEY, newTheme);
  } catch (e) {}
  
  applyShathaTheme(newTheme, true, true);

  if (navigator.vibrate) {
    try { navigator.vibrate(25); } catch (e) {}
  }
};

// تهيئة فورية عند تحميل المستند
(function initTheme() {
  const activeTheme = getShathaTheme();
  applyShathaTheme(activeTheme, false, false);

  document.addEventListener('DOMContentLoaded', () => {
    updateThemeUI(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        window.toggleTheme();
      };
    });
  });

  // الاستماع لتغيير وضع النظام في حال لم يحدد المستخدم يدوياً
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      try {
        if (!localStorage.getItem(SHATHA_THEME_KEY)) {
          applyShathaTheme(e.matches ? 'dark' : 'light', true, false);
        }
      } catch (err) {}
    });
  }
})();


