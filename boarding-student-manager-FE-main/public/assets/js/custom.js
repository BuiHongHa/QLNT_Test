

var swiper = new Swiper(".service-slider", {
    spaceBetween: 0,
    slidesPerView: "auto",
    freeMode: false,
    watchSlidesProgress: false,
    // simulateTouch: false
});
var swiper2 = new Swiper(".service-content-slider", {
    autoHeight: true,
    spaceBetween: 0,
    navigation: false,
    thumbs: {
        swiper: swiper,
    },

});


// ---------------
$(".news-slider").slick({
    dots: false,
    infinite: true,
    slidesToShow: 3,
    slidesToScroll: 3,
    prevArrow: "<i class='fal fa-chevron-left swiper-prev'></i>",
    nextArrow: "<i class='fal fa-chevron-right swiper-next'></i>",
    responsive: [{
            breakpoint: 1300,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 2,
            },
        },
        {
            breakpoint: 1100,
            settings: {
                slidesToShow: 3,
                slidesToScroll: 3,
            },
        },
        {
            breakpoint: 980,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 2,
                adaptiveHeight: true,
            },
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 1,
                slidesToScroll: 1,
            },
        },
    ],
});

$(".friend-slider").slick({

    dots: false,
    infinite: true,
    slidesToShow: 9,
    slidesToScroll: 9,
    prevArrow: "<i class='fal fa-chevron-left swiper-prev'></i>",
    nextArrow: "<i class='fal fa-chevron-right swiper-next'></i>",
    responsive: [{
            breakpoint: 1300,
            settings: {
                slidesToShow: 6,
                slidesToScroll: 6,
            },
        },
        {
            breakpoint: 1100,
            settings: {
                slidesToShow: 9,
                slidesToScroll: 9,
            },
        },
        {
            breakpoint: 980,
            settings: {
                slidesToShow: 6,
                slidesToScroll: 6,
                adaptiveHeight: true,
            },
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 3,
                slidesToScroll: 3,
            },
        },


    ],
});

$(".brand-slider").slick({
    dots: false,
    infinite: true,
    slidesToShow: 9,
    slidesToScroll: 9,
    prevArrow: "<i class='fal fa-chevron-left swiper-prev'></i>",
    nextArrow: "<i class='fal fa-chevron-right swiper-next'></i>",
    responsive: [{
            breakpoint: 1300,
            settings: {
                slidesToShow: 6,
                slidesToScroll: 6,
            },
        },
        {
            breakpoint: 980,
            settings: {
                slidesToShow: 4,
                slidesToScroll: 4,
                adaptiveHeight: true,
            },
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 3,
                slidesToScroll: 3,
            },
        },
    ],
});
$(".teach-login-slider").slick({

    dots: false,
    infinite: true,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: false,
    autoplay: true,
    autoplaySpeed: 2000,


});
// --------
var $windowWidth = $(window).width();
if ($windowWidth < 1201 && $windowWidth > 768) {
    $('.wrapper').addClass('small-sidebar');
}
$('.menu-icon').click(function() {
    $('.wrapper').toggleClass('small-sidebar');
});
$('.menu-icon-mobi').click(function() {
    $('.sidebar-menu').toggleClass('show');
    $('.overlay').toggle();

});
$('.mobi-search-icon').click(function() {

    $('.search-group').addClass('show');
    $(this).hide();
    $('.logo').hide();
});
$(document).on('click', function(event) {
    if (!$(event.target).closest('.search-group-in-mobi').length) {
        $('.search-group').removeClass('show');
        $('.mobi-search-icon').show();
        $('.logo').show();

    };
    if (!$(event.target).closest('.left-sidebar').length) {
        $('.sidebar-menu').removeClass('show');
        $('.overlay').hide();

    };

});
// -------------class modal height
$('#modal-total-class').on('shown.bs.modal', function(e) {
    $('.masonry-bq').masonry()
});
// end class modal height